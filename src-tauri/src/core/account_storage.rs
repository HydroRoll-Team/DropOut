use crate::core::auth::{Account, MicrosoftAccount, OfflineAccount};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use ts_rs::TS;

/// Stored account data for persistence
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "account.ts")]
pub struct AccountStore {
    pub accounts: Vec<StoredAccount>,
    pub active_account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type")]
#[ts(export, export_to = "account.ts")]
pub enum StoredAccount {
    Offline(OfflineAccount),
    Microsoft(StoredMicrosoftAccount),
}

/// Microsoft account with refresh token for persistence
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "account.ts")]
pub struct StoredMicrosoftAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub ms_refresh_token: Option<String>, // Microsoft OAuth refresh token
    pub expires_at: i64,
}

impl StoredAccount {
    pub fn id(&self) -> String {
        match self {
            StoredAccount::Offline(a) => a.uuid.clone(),
            StoredAccount::Microsoft(a) => a.uuid.clone(),
        }
    }

    pub fn to_account(&self) -> Account {
        match self {
            StoredAccount::Offline(a) => Account::Offline(a.clone()),
            StoredAccount::Microsoft(a) => Account::Microsoft(MicrosoftAccount {
                username: a.username.clone(),
                uuid: a.uuid.clone(),
                access_token: a.access_token.clone(),
                refresh_token: a.refresh_token.clone(),
                expires_at: a.expires_at,
            }),
        }
    }

    pub fn from_account(account: &Account, ms_refresh_token: Option<String>) -> Self {
        match account {
            Account::Offline(a) => StoredAccount::Offline(a.clone()),
            Account::Microsoft(a) => StoredAccount::Microsoft(StoredMicrosoftAccount {
                username: a.username.clone(),
                uuid: a.uuid.clone(),
                access_token: a.access_token.clone(),
                refresh_token: a.refresh_token.clone(),
                ms_refresh_token,
                expires_at: a.expires_at,
            }),
        }
    }
}

#[derive(Debug, Clone, TS)]
#[ts(export, export_to = "account.ts")]
pub struct AccountStorage {
    file_path: PathBuf,
}

impl AccountStorage {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            file_path: app_data_dir.join("accounts.json"),
        }
    }

    pub fn load(&self) -> AccountStore {
        if self.file_path.exists() {
            let content = fs::read_to_string(&self.file_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AccountStore::default()
        }
    }

    pub fn save(&self, store: &AccountStore) -> Result<(), String> {
        let content = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&self.file_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_or_update_account(
        &self,
        account: &Account,
        ms_refresh_token: Option<String>,
    ) -> Result<(), String> {
        let mut store = self.load();
        let stored = StoredAccount::from_account(account, ms_refresh_token);
        let id = stored.id();

        // Remove existing account with same ID
        store.accounts.retain(|a| a.id() != id);
        store.accounts.push(stored);
        store.active_account_id = Some(id);

        self.save(&store)
    }

    pub fn remove_account(&self, uuid: &str) -> Result<(), String> {
        let mut store = self.load();
        store.accounts.retain(|a| a.id() != uuid);
        if store.active_account_id.as_deref() == Some(uuid) {
            store.active_account_id = store.accounts.first().map(|a| a.id());
        }
        self.save(&store)
    }

    pub fn get_active_account(&self) -> Option<(StoredAccount, Option<String>)> {
        let store = self.load();
        if let Some(active_id) = &store.active_account_id {
            store
                .accounts
                .iter()
                .find(|a| &a.id() == active_id)
                .map(|a| {
                    let ms_token = match a {
                        StoredAccount::Microsoft(m) => m.ms_refresh_token.clone(),
                        _ => None,
                    };
                    (a.clone(), ms_token)
                })
        } else {
            None
        }
    }

    #[allow(dead_code)]
    pub fn set_active_account(&self, uuid: &str) -> Result<(), String> {
        let mut store = self.load();
        if store.accounts.iter().any(|a| a.id() == uuid) {
            store.active_account_id = Some(uuid.to_string());
            self.save(&store)
        } else {
            Err("Account not found".to_string())
        }
    }

    #[allow(dead_code)]
    pub fn get_all_accounts(&self) -> Vec<StoredAccount> {
        self.load().accounts
    }
}
