use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use ts_rs::TS;
use uuid::Uuid;

// Helper to create a client with a custom User-Agent
// This is critical because Microsoft's WAF often blocks requests without a valid UA
fn get_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("DropOut/1.0")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
#[ts(export, tag = "type", export_to = "auth.ts")]
pub enum Account {
    Offline(OfflineAccount),
    Microsoft(MicrosoftAccount),
}

impl Account {
    pub fn username(&self) -> String {
        match self {
            Account::Offline(a) => a.username.clone(),
            Account::Microsoft(a) => a.username.clone(),
        }
    }

    pub fn uuid(&self) -> String {
        match self {
            Account::Offline(a) => a.uuid.clone(),
            Account::Microsoft(a) => a.uuid.clone(),
        }
    }

    pub fn access_token(&self) -> String {
        match self {
            Account::Offline(_) => "null".to_string(),
            Account::Microsoft(a) => a.access_token.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "auth.ts")]
pub struct OfflineAccount {
    pub username: String,
    pub uuid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "auth.ts")]
pub struct MicrosoftAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
}

pub struct AccountState {
    pub active_account: Mutex<Option<Account>>,
}

impl AccountState {
    pub fn new() -> Self {
        Self {
            active_account: Mutex::new(None),
        }
    }
}

pub fn generate_offline_uuid(username: &str) -> String {
    let namespace = Uuid::NAMESPACE_OID;
    Uuid::new_v3(&namespace, username.as_bytes()).to_string()
}

const CLIENT_ID: &str = "fe165602-5410-4441-92f7-326e10a7cb82";
const SCOPE: &str = "XboxLive.SignIn XboxLive.offline_access";

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all(serialize = "camelCase"))]
#[ts(export, export_to = "auth.ts", rename_all = "camelCase")]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all(serialize = "camelCase"))]
#[ts(export, export_to = "auth.ts")]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
}

// Error response from token endpoint
#[derive(Debug, Serialize, Deserialize)]
pub struct TokenError {
    pub error: String,
}

/// Refresh Microsoft OAuth token using refresh_token
pub async fn refresh_microsoft_token(refresh_token: &str) -> Result<TokenResponse, String> {
    let client = get_client();
    let url = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", CLIENT_ID),
        ("refresh_token", refresh_token),
        ("scope", SCOPE),
    ];

    let resp = client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(serde_urlencoded::to_string(params).map_err(|e| e.to_string())?)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = resp.text().await.map_err(|e| e.to_string())?;

    if let Ok(token_resp) = serde_json::from_str::<TokenResponse>(&text) {
        println!("[Auth] Token refreshed successfully!");
        return Ok(token_resp);
    }

    if let Ok(err_resp) = serde_json::from_str::<TokenError>(&text) {
        println!("[Auth] Token refresh error: {}", err_resp.error);
        return Err(format!("Token refresh failed: {}", err_resp.error));
    }

    Err(format!("Unknown refresh response: {}", text))
}

/// Check if a Microsoft account token is expired or about to expire
pub fn is_token_expired(expires_at: i64) -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Consider expired if less than 5 minutes remaining
    expires_at - now < 300
}

/// Full refresh flow: refresh MS token -> Xbox -> XSTS -> Minecraft
pub async fn refresh_full_auth(
    ms_refresh_token: &str,
) -> Result<(MicrosoftAccount, String), String> {
    println!("[Auth] Starting full token refresh...");

    // 1. Refresh Microsoft token
    let token_resp = refresh_microsoft_token(ms_refresh_token).await?;

    // 2. Xbox Live Auth
    let (xbl_token, uhs) = method_xbox_live(&token_resp.access_token).await?;

    // 3. XSTS Auth
    let xsts_token = method_xsts(&xbl_token).await?;

    // 4. Minecraft Auth
    let mc_token = login_minecraft(&xsts_token, &uhs).await?;

    // 5. Get Profile
    let profile = fetch_profile(&mc_token).await?;

    // 6. Create Account
    let account = MicrosoftAccount {
        username: profile.name,
        uuid: profile.id,
        access_token: mc_token,
        refresh_token: token_resp.refresh_token.clone(),
        expires_at: (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + token_resp.expires_in) as i64,
    };

    // Return new MS refresh token for storage
    let new_ms_refresh = token_resp
        .refresh_token
        .unwrap_or_else(|| ms_refresh_token.to_string());

    Ok((account, new_ms_refresh))
}

// Xbox Live Auth
#[derive(Debug, Serialize, Deserialize)]
pub struct XboxLiveResponse {
    #[serde(rename = "Token")]
    pub token: String,
    #[serde(rename = "DisplayClaims")]
    pub display_claims: DisplayClaims,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DisplayClaims {
    pub xui: Vec<serde_json::Value>, // We need "uhs" from this
}

// Minecraft Auth
#[derive(Debug, Serialize, Deserialize)]
pub struct MinecraftAuthResponse {
    pub access_token: String,
    pub expires_in: u64,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "auth.ts")]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
}

// 1. Start Device Flow
pub async fn start_device_flow() -> Result<DeviceCodeResponse, String> {
    let client = get_client();
    let url = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";

    let params = [("client_id", CLIENT_ID), ("scope", SCOPE)];

    let resp = client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(serde_urlencoded::to_string(params).map_err(|e| e.to_string())?)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_else(|_| "No body".to_string());
        return Err(format!(
            "Device code request failed: {} - Body: {}",
            status, text
        ));
    }

    let body = resp
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(body)
}

// 2. Poll for Token (Simplified: User calls this repeatedly or we loop inside a command)
// We'll implement a function that tries ONCE, consuming the device_code.
pub async fn exchange_code_for_token(device_code: &str) -> Result<TokenResponse, String> {
    let client = get_client();
    let url = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

    let params = [
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ("client_id", CLIENT_ID),
        ("device_code", device_code),
    ];

    let resp = client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(serde_urlencoded::to_string(params).map_err(|e| e.to_string())?)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // Check application level error (e.g. "authorization_pending")
    let text = resp.text().await.map_err(|e| e.to_string())?;

    // Try parse success
    if let Ok(token_resp) = serde_json::from_str::<TokenResponse>(&text) {
        println!("[Auth] Token received successfully!");
        return Ok(token_resp);
    }

    // Try parse error
    if let Ok(err_resp) = serde_json::from_str::<TokenError>(&text) {
        if err_resp.error != "authorization_pending" {
            println!("[Auth] Polling error: {}", err_resp.error);
        }
        return Err(err_resp.error); // "authorization_pending", "expired_token", "access_denied"
    }

    println!("[Auth] Unknown response body: {}", text);
    Err(format!("Unknown response: {}", text))
}

// 3. Authenticate with Xbox Live
pub async fn method_xbox_live(ms_access_token: &str) -> Result<(String, String), String> {
    println!("[Auth] Starting Xbox Live auth...");
    let client = get_client();
    let url = "https://user.auth.xboxlive.com/user/authenticate";

    let payload = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", ms_access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let resp = client
        .post(url)
        .json(&payload)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        println!("[Auth] Xbox Live auth failed: {} - {}", status, text);
        return Err(format!("Xbox Live auth failed: {} - {}", status, text));
    }

    let xbl_resp: XboxLiveResponse = resp.json().await.map_err(|e| e.to_string())?;
    println!("[Auth] Xbox Live auth success!");

    // Extract UHS (User Hash)
    let uhs = xbl_resp
        .display_claims
        .xui
        .first()
        .and_then(|x| x.get("uhs"))
        .and_then(|s| s.as_str())
        .ok_or("Failed to find UHS code")?
        .to_string();

    Ok((xbl_resp.token, uhs))
}

// 4. Authenticate with XSTS
pub async fn method_xsts(xbl_token: &str) -> Result<String, String> {
    println!("[Auth] Starting XSTS auth...");
    let client = get_client();
    let url = "https://xsts.auth.xboxlive.com/xsts/authorize";

    let payload = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let resp = client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        // Should handle specific errors like "Account not verified", "Age restriction"
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        println!("[Auth] XSTS auth failed: {} - {}", status, text);
        return Err(format!("XSTS auth failed: {} - {}", status, text));
    }

    let xsts_resp: XboxLiveResponse = resp.json().await.map_err(|e| e.to_string())?;
    println!("[Auth] XSTS auth success!");
    Ok(xsts_resp.token)
}

// 5. Authenticate with Minecraft
// Using the newer /launcher/login endpoint which is what modern launchers use
pub async fn login_minecraft(xsts_token: &str, uhs: &str) -> Result<String, String> {
    println!("[Auth] Starting Minecraft auth...");
    let client = get_client();
    let url = "https://api.minecraftservices.com/launcher/login";

    let payload = serde_json::json!({
        "xtoken": format!("XBL3.0 x={};{}", uhs, xsts_token),
        "platform": "PC_LAUNCHER"
    });

    let resp = client
        .post(url)
        .json(&payload)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_else(|_| "No body".to_string());
        println!("[Auth] Minecraft auth failed: {} - {}", status, text);
        return Err(format!(
            "Minecraft auth failed: {} - Body: {}",
            status, text
        ));
    }

    let mc_resp: MinecraftAuthResponse = resp.json().await.map_err(|e| e.to_string())?;
    println!("[Auth] Minecraft auth success!");
    Ok(mc_resp.access_token)
}

// 6. Get Profile
pub async fn fetch_profile(mc_access_token: &str) -> Result<MinecraftProfile, String> {
    let client = get_client();
    let url = "https://api.minecraftservices.com/minecraft/profile";

    let resp = client
        .get(url)
        .bearer_auth(mc_access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Profile fetch failed: {} - {}", status, text));
    }

    let profile: MinecraftProfile = resp.json().await.map_err(|e| e.to_string())?;
    Ok(profile)
}

// 7. Check Game Ownership
#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct Entitlement {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct EntitlementsResponse {
    pub items: Vec<Entitlement>,
    pub signature: Option<String>,
    #[serde(rename = "keyId")]
    pub key_id: Option<String>,
}

#[allow(dead_code)]
pub async fn check_ownership(mc_access_token: &str) -> Result<bool, String> {
    let client = get_client();
    let url = "https://api.minecraftservices.com/entitlements/mcstore";

    let resp = client
        .get(url)
        .bearer_auth(mc_access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Entitlement check failed: {} - {}", status, text));
    }

    let body: EntitlementsResponse = resp.json().await.map_err(|e| e.to_string())?;
    // We look for "product_minecraft" or "game_minecraft"
    let owns_game = body
        .items
        .iter()
        .any(|e| e.name == "product_minecraft" || e.name == "game_minecraft");
    Ok(owns_game)
}
