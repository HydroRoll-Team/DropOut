use super::config::AssistantConfig;
use futures::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Window};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "assistant.ts")]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct OllamaChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub stream: bool,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OllamaChatResponse {
    pub model: String,
    pub created_at: String,
    pub message: Message,
    pub done: bool,
}

// Ollama model list response structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModelDetails {
    pub format: Option<String>,
    pub family: Option<String>,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub modified_at: Option<String>,
    pub size: Option<u64>,
    pub digest: Option<String>,
    pub details: Option<OllamaModelDetails>,
}

#[derive(Debug, Deserialize)]
pub struct OllamaTagsResponse {
    pub models: Vec<OllamaModel>,
}

// Simplified model info for frontend
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "assistant.ts")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub size: Option<String>,
    pub details: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub stream: bool,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIChoice {
    pub index: i32,
    pub message: Message,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIChatResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<OpenAIChoice>,
}

// OpenAI models list response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIModelData {
    pub id: String,
    pub object: String,
    pub created: Option<i64>,
    pub owned_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIModelsResponse {
    pub object: String,
    pub data: Vec<OpenAIModelData>,
}

// Streaming response structures
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "assistant.ts")]
pub struct GenerationStats {
    pub total_duration: u64,
    pub load_duration: u64,
    pub prompt_eval_count: u64,
    pub prompt_eval_duration: u64,
    pub eval_count: u64,
    pub eval_duration: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "assistant.ts")]
pub struct StreamChunk {
    pub content: String,
    pub done: bool,
    pub stats: Option<GenerationStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "assistant.ts")]
pub struct AssistantLogContext {
    pub content: String,
    pub line_count: usize,
}

// Ollama streaming response (each line is a JSON object)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OllamaStreamResponse {
    pub model: Option<String>,
    pub created_at: Option<String>,
    pub message: Option<Message>,
    pub done: bool,
    pub total_duration: Option<u64>,
    pub load_duration: Option<u64>,
    pub prompt_eval_count: Option<u64>,
    pub prompt_eval_duration: Option<u64>,
    pub eval_count: Option<u64>,
    pub eval_duration: Option<u64>,
}

// OpenAI streaming response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIStreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIStreamChoice {
    pub index: i32,
    pub delta: OpenAIStreamDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIStreamResponse {
    pub id: Option<String>,
    pub object: Option<String>,
    pub created: Option<i64>,
    pub model: Option<String>,
    pub choices: Vec<OpenAIStreamChoice>,
}

#[derive(Clone)]
pub struct GameAssistant {
    client: reqwest::Client,
    pub log_buffer: VecDeque<String>,
    pub max_log_lines: usize,
}

impl GameAssistant {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            log_buffer: VecDeque::new(),
            max_log_lines: 100,
        }
    }

    pub fn add_log(&mut self, line: String) {
        if self.log_buffer.len() >= self.max_log_lines {
            self.log_buffer.pop_front();
        }
        self.log_buffer.push_back(line);
    }

    pub fn clear_logs(&mut self) {
        self.log_buffer.clear();
    }

    pub fn get_sanitized_log_context(&self, additional_lines: &[String]) -> AssistantLogContext {
        let mut seen = HashSet::new();
        let mut lines = self
            .log_buffer
            .iter()
            .chain(additional_lines.iter())
            .filter_map(|line| {
                let trimmed = line.trim();
                (!trimmed.is_empty() && seen.insert(trimmed.to_string()))
                    .then(|| sanitize_log_line(trimmed))
            })
            .collect::<Vec<_>>();
        if lines.len() > self.max_log_lines {
            lines.drain(..lines.len() - self.max_log_lines);
        }
        let line_count = lines.len();
        let content = lines.join("\n");

        AssistantLogContext {
            line_count,
            content,
        }
    }

    fn validate_config(config: &AssistantConfig) -> Result<(), String> {
        if !config.enabled {
            return Err("Assistant is disabled".to_string());
        }

        match config.llm_provider.as_str() {
            "ollama" => {
                if config.ollama_endpoint.trim().is_empty() {
                    return Err("Ollama endpoint is not configured".to_string());
                }
                if config.ollama_model.trim().is_empty() {
                    return Err("Ollama model is not configured".to_string());
                }
            }
            "openai" => {
                if config.openai_endpoint.trim().is_empty() {
                    return Err("OpenAI-compatible endpoint is not configured".to_string());
                }
                if config.openai_model.trim().is_empty() {
                    return Err("OpenAI-compatible model is not configured".to_string());
                }
                if config
                    .openai_api_key
                    .as_deref()
                    .is_none_or(|key| key.trim().is_empty())
                {
                    return Err("OpenAI-compatible API key is not configured".to_string());
                }
            }
            provider => return Err(format!("Unknown LLM provider: {provider}")),
        }

        Ok(())
    }

    pub async fn check_health(&self, config: &AssistantConfig) -> bool {
        if Self::validate_config(config).is_err() {
            return false;
        }

        if config.llm_provider == "ollama" {
            match self
                .client
                .get(format!(
                    "{}/api/tags",
                    config.ollama_endpoint.trim_end_matches('/')
                ))
                .send()
                .await
            {
                Ok(res) => res.status().is_success(),
                Err(_) => false,
            }
        } else if config.llm_provider == "openai" {
            let Some(api_key) = config.openai_api_key.as_deref() else {
                return false;
            };
            match self
                .client
                .get(format!(
                    "{}/models",
                    config.openai_endpoint.trim_end_matches('/')
                ))
                .header("Authorization", format!("Bearer {api_key}"))
                .send()
                .await
            {
                Ok(response) => response.status().is_success(),
                Err(_) => false,
            }
        } else {
            false
        }
    }

    pub async fn chat(
        &self,
        mut messages: Vec<Message>,
        config: &AssistantConfig,
        log_context: Option<String>,
    ) -> Result<Message, String> {
        Self::validate_config(config)?;

        // Inject system prompt and log context
        if !messages.iter().any(|m| m.role == "system") {
            let context = log_context
                .as_deref()
                .map(sanitize_log_text)
                .unwrap_or_default();
            let mut system_content = config.system_prompt.clone();

            // Add language instruction if not auto
            if config.response_language != "auto" {
                system_content = format!(
                    "{}\n\nIMPORTANT: Respond in {}. Do not include Pinyin or English translations unless explicitly requested.",
                    system_content, config.response_language
                );
            }

            // Add log context if available
            if !context.is_empty() {
                system_content = format!(
                    "{}\n\nRecent game logs:\n```\n{}\n```",
                    system_content, context
                );
            }

            messages.insert(
                0,
                Message {
                    role: "system".to_string(),
                    content: system_content,
                },
            );
        }

        if config.llm_provider == "ollama" {
            self.chat_ollama(messages, config).await
        } else if config.llm_provider == "openai" {
            self.chat_openai(messages, config).await
        } else {
            Err(format!("Unknown LLM provider: {}", config.llm_provider))
        }
    }

    async fn chat_ollama(
        &self,
        messages: Vec<Message>,
        config: &AssistantConfig,
    ) -> Result<Message, String> {
        let request = OllamaChatRequest {
            model: config.ollama_model.clone(),
            messages,
            stream: false,
        };

        let response = self
            .client
            .post(format!(
                "{}/api/chat",
                config.ollama_endpoint.trim_end_matches('/')
            ))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API returned error: {}", response.status()));
        }

        let chat_response: OllamaChatResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        Ok(chat_response.message)
    }

    async fn chat_openai(
        &self,
        messages: Vec<Message>,
        config: &AssistantConfig,
    ) -> Result<Message, String> {
        let api_key = config
            .openai_api_key
            .as_ref()
            .ok_or("OpenAI API key not configured")?;

        let request = OpenAIChatRequest {
            model: config.openai_model.clone(),
            messages,
            stream: false,
        };

        let response = self
            .client
            .post(format!(
                "{}/chat/completions",
                config.openai_endpoint.trim_end_matches('/')
            ))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({}): {}", status, error_text));
        }

        let chat_response: OpenAIChatResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        chat_response
            .choices
            .into_iter()
            .next()
            .map(|c| c.message)
            .ok_or_else(|| "No response from OpenAI".to_string())
    }

    pub async fn list_ollama_models(&self, endpoint: &str) -> Result<Vec<ModelInfo>, String> {
        let response = self
            .client
            .get(format!("{}/api/tags", endpoint.trim_end_matches('/')))
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API error: {}", response.status()));
        }

        let tags_response: OllamaTagsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        let models: Vec<ModelInfo> = tags_response
            .models
            .into_iter()
            .map(|m| {
                let size_str = m.size.map(format_size);
                let details_str = m.details.map(|d| {
                    let mut parts = Vec::new();
                    if let Some(family) = d.family {
                        parts.push(family);
                    }
                    if let Some(params) = d.parameter_size {
                        parts.push(params);
                    }
                    if let Some(quant) = d.quantization_level {
                        parts.push(quant);
                    }
                    parts.join(" / ")
                });

                ModelInfo {
                    id: m.name.clone(),
                    name: m.name,
                    size: size_str,
                    details: details_str,
                }
            })
            .collect();

        Ok(models)
    }

    pub async fn list_openai_models(
        &self,
        config: &AssistantConfig,
    ) -> Result<Vec<ModelInfo>, String> {
        let api_key = config
            .openai_api_key
            .as_ref()
            .ok_or("OpenAI API key not configured")?;

        let response = self
            .client
            .get(format!(
                "{}/models",
                config.openai_endpoint.trim_end_matches('/')
            ))
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to connect to OpenAI: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({}): {}", status, error_text));
        }

        let models_response: OpenAIModelsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        // Filter to only show chat models (gpt-*)
        let models: Vec<ModelInfo> = models_response
            .data
            .into_iter()
            .filter(|m| {
                m.id.starts_with("gpt-") || m.id.starts_with("o1") || m.id.contains("turbo")
            })
            .map(|m| ModelInfo {
                id: m.id.clone(),
                name: m.id,
                size: None,
                details: m.owned_by,
            })
            .collect();

        Ok(models)
    }

    // Streaming chat methods
    pub async fn chat_stream(
        &self,
        mut messages: Vec<Message>,
        config: &AssistantConfig,
        window: &Window,
        log_context: Option<String>,
    ) -> Result<String, String> {
        Self::validate_config(config)?;

        // Inject system prompt and log context
        if !messages.iter().any(|m| m.role == "system") {
            let context = log_context
                .as_deref()
                .map(sanitize_log_text)
                .unwrap_or_default();
            let mut system_content = config.system_prompt.clone();

            if config.response_language != "auto" {
                system_content = format!(
                    "{}\n\nIMPORTANT: Respond in {}. Do not include Pinyin or English translations unless explicitly requested.",
                    system_content, config.response_language
                );
            }

            if !context.is_empty() {
                system_content = format!(
                    "{}\n\nRecent game logs:\n```\n{}\n```",
                    system_content, context
                );
            }

            messages.insert(
                0,
                Message {
                    role: "system".to_string(),
                    content: system_content,
                },
            );
        }

        if config.llm_provider == "ollama" {
            self.chat_stream_ollama(messages, config, window).await
        } else if config.llm_provider == "openai" {
            self.chat_stream_openai(messages, config, window).await
        } else {
            Err(format!("Unknown LLM provider: {}", config.llm_provider))
        }
    }

    async fn chat_stream_ollama(
        &self,
        messages: Vec<Message>,
        config: &AssistantConfig,
        window: &Window,
    ) -> Result<String, String> {
        let request = OllamaChatRequest {
            model: config.ollama_model.clone(),
            messages,
            stream: true,
        };

        let response = self
            .client
            .post(format!(
                "{}/api/chat",
                config.ollama_endpoint.trim_end_matches('/')
            ))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API returned error: {}", response.status()));
        }

        let mut full_content = String::new();
        let mut stream = response.bytes_stream();
        let mut buffer = Vec::new();

        let process_line = |line: &[u8], full_content: &mut String| -> Result<(), String> {
            if line.iter().all(u8::is_ascii_whitespace) {
                return Ok(());
            }
            let stream_response = serde_json::from_slice::<OllamaStreamResponse>(line)
                .map_err(|error| format!("Failed to parse Ollama stream response: {error}"))?;

            if let Some(message) = stream_response.message {
                full_content.push_str(&message.content);
                let _ = window.emit(
                    "assistant-stream",
                    StreamChunk {
                        content: message.content,
                        done: false,
                        stats: None,
                    },
                );
            }
            if stream_response.done {
                let stats = match (
                    stream_response.total_duration,
                    stream_response.load_duration,
                    stream_response.prompt_eval_count,
                    stream_response.prompt_eval_duration,
                    stream_response.eval_count,
                    stream_response.eval_duration,
                ) {
                    (
                        Some(total_duration),
                        Some(load_duration),
                        Some(prompt_eval_count),
                        Some(prompt_eval_duration),
                        Some(eval_count),
                        Some(eval_duration),
                    ) => Some(GenerationStats {
                        total_duration,
                        load_duration,
                        prompt_eval_count,
                        prompt_eval_duration,
                        eval_count,
                        eval_duration,
                    }),
                    _ => None,
                };

                let _ = window.emit(
                    "assistant-stream",
                    StreamChunk {
                        content: String::new(),
                        done: true,
                        stats,
                    },
                );
            }

            Ok(())
        };

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    for line in take_complete_lines(&mut buffer, &chunk) {
                        process_line(&line, &mut full_content)?;
                    }
                }
                Err(e) => {
                    return Err(format!("Stream error: {}", e));
                }
            }
        }
        if !buffer.is_empty() {
            process_line(&buffer, &mut full_content)?;
        }

        Ok(full_content)
    }

    async fn chat_stream_openai(
        &self,
        messages: Vec<Message>,
        config: &AssistantConfig,
        window: &Window,
    ) -> Result<String, String> {
        let api_key = config
            .openai_api_key
            .as_ref()
            .ok_or("OpenAI API key not configured")?;

        let request = OpenAIChatRequest {
            model: config.openai_model.clone(),
            messages,
            stream: true,
        };

        let response = self
            .client
            .post(format!(
                "{}/chat/completions",
                config.openai_endpoint.trim_end_matches('/')
            ))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({}): {}", status, error_text));
        }

        let mut full_content = String::new();
        let mut stream = response.bytes_stream();
        let mut buffer = Vec::new();

        let process_line = |line: &[u8], full_content: &mut String| -> Result<(), String> {
            let line = std::str::from_utf8(line)
                .map_err(|error| format!("Invalid UTF-8 in OpenAI-compatible stream: {error}"))?
                .trim();
            if line.is_empty() {
                return Ok(());
            }
            if line == "data: [DONE]" {
                let _ = window.emit(
                    "assistant-stream",
                    StreamChunk {
                        content: String::new(),
                        done: true,
                        stats: None,
                    },
                );
                return Ok(());
            }

            let Some(data) = line.strip_prefix("data: ") else {
                return Ok(());
            };
            let stream_response =
                serde_json::from_str::<OpenAIStreamResponse>(data).map_err(|error| {
                    format!("Failed to parse OpenAI-compatible stream response: {error}")
                })?;
            if let Some(choice) = stream_response.choices.first() {
                if let Some(content) = &choice.delta.content {
                    full_content.push_str(content);
                    let _ = window.emit(
                        "assistant-stream",
                        StreamChunk {
                            content: content.clone(),
                            done: false,
                            stats: None,
                        },
                    );
                }
                if choice.finish_reason.is_some() {
                    let _ = window.emit(
                        "assistant-stream",
                        StreamChunk {
                            content: String::new(),
                            done: true,
                            stats: None,
                        },
                    );
                }
            }

            Ok(())
        };

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    for line in take_complete_lines(&mut buffer, &chunk) {
                        process_line(&line, &mut full_content)?;
                    }
                }
                Err(e) => {
                    return Err(format!("Stream error: {}", e));
                }
            }
        }
        if !buffer.is_empty() {
            process_line(&buffer, &mut full_content)?;
        }

        Ok(full_content)
    }
}

fn take_complete_lines(buffer: &mut Vec<u8>, chunk: &[u8]) -> Vec<Vec<u8>> {
    buffer.extend_from_slice(chunk);
    let mut lines = Vec::new();

    while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
        let mut line = buffer.drain(..=newline).collect::<Vec<_>>();
        line.pop();
        if line.last() == Some(&b'\r') {
            line.pop();
        }
        lines.push(line);
    }

    lines
}

fn sanitize_log_line(line: &str) -> String {
    static BEARER: OnceLock<Regex> = OnceLock::new();
    static SECRET_FIELD: OnceLock<Regex> = OnceLock::new();
    static JWT: OnceLock<Regex> = OnceLock::new();
    static UNIX_HOME: OnceLock<Regex> = OnceLock::new();
    static WINDOWS_HOME: OnceLock<Regex> = OnceLock::new();
    static EMAIL: OnceLock<Regex> = OnceLock::new();
    static IPV4: OnceLock<Regex> = OnceLock::new();

    let bearer = BEARER.get_or_init(|| {
        Regex::new(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s,;]+")
            .expect("valid bearer-token regex")
    });
    let secret_field = SECRET_FIELD.get_or_init(|| {
        Regex::new(
            r#"(?i)((?:access[_ -]?token|refresh[_ -]?token|api[_ -]?key|password)\s*[:=]\s*)[\"']?[^\s,;\"']+"#,
        )
        .expect("valid secret-field regex")
    });
    let jwt = JWT.get_or_init(|| {
        Regex::new(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
            .expect("valid JWT regex")
    });
    let unix_home = UNIX_HOME.get_or_init(|| {
        Regex::new(r"(?:/Users|/home)/[^/\s]+").expect("valid Unix home-directory regex")
    });
    let windows_home = WINDOWS_HOME.get_or_init(|| {
        Regex::new(r"(?i)[A-Z]:\\Users\\[^\\\s]+").expect("valid Windows home-directory regex")
    });
    let email = EMAIL.get_or_init(|| {
        Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}").expect("valid email regex")
    });
    let ipv4 =
        IPV4.get_or_init(|| Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").expect("valid IPv4 regex"));

    let sanitized = bearer.replace_all(line, "$1[redacted]");
    let sanitized = secret_field.replace_all(&sanitized, "$1[redacted]");
    let sanitized = jwt.replace_all(&sanitized, "[redacted-token]");
    let sanitized = unix_home.replace_all(&sanitized, "~");
    let sanitized = windows_home.replace_all(&sanitized, "~");
    let sanitized = email.replace_all(&sanitized, "[redacted-email]");
    ipv4.replace_all(&sanitized, "[redacted-ip]").into_owned()
}

fn sanitize_log_text(context: &str) -> String {
    context
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            (!trimmed.is_empty()).then(|| sanitize_log_line(trimmed))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assistant_context_is_empty_until_a_game_emits_logs() {
        let assistant = GameAssistant::new();

        assert_eq!(
            assistant.get_sanitized_log_context(&[]).line_count,
            0,
            "an idle launcher must not invent diagnostic context"
        );
        assert!(assistant.get_sanitized_log_context(&[]).content.is_empty());
    }

    #[test]
    fn assistant_context_redacts_credentials_and_player_identifiers() {
        let mut assistant = GameAssistant::new();
        assistant.add_log(
            "Authorization: Bearer secret-token /Users/alice/.minecraft user@example.com 203.0.113.8"
                .to_string(),
        );
        assistant.add_log("api_key=sk-test-value C:\\Users\\Alice\\AppData".to_string());

        let context = assistant.get_sanitized_log_context(&[]);

        assert_eq!(context.line_count, 2);
        assert!(context.content.contains("Bearer [redacted]"));
        assert!(context.content.contains("api_key=[redacted]"));
        assert!(context.content.contains("~/.minecraft"));
        assert!(context.content.contains("~\\AppData"));
        assert!(context.content.contains("[redacted-email]"));
        assert!(context.content.contains("[redacted-ip]"));
        assert!(!context.content.contains("secret-token"));
        assert!(!context.content.contains("alice"));
        assert!(!context.content.contains("sk-test-value"));
    }

    #[test]
    fn assistant_context_combines_frontend_failures_without_duplicate_lines() {
        let mut assistant = GameAssistant::new();
        assistant.add_log("Process exited with code 1".to_string());
        let frontend_lines = vec![
            "Could not resolve Fabric mods".to_string(),
            "Process exited with code 1".to_string(),
        ];

        let context = assistant.get_sanitized_log_context(&frontend_lines);

        assert_eq!(context.line_count, 2);
        assert_eq!(
            context.content,
            "Process exited with code 1\nCould not resolve Fabric mods"
        );
    }

    #[test]
    fn clearing_logs_starts_a_new_diagnostic_session() {
        let mut assistant = GameAssistant::new();
        assistant.add_log("old session".to_string());

        assistant.clear_logs();

        assert!(assistant.get_sanitized_log_context(&[]).content.is_empty());
    }

    #[test]
    fn streaming_line_buffer_preserves_split_json_and_utf8() {
        let payload =
            "{\"message\":{\"role\":\"assistant\",\"content\":\"修复\"},\"done\":false}\n";
        let bytes = payload.as_bytes();
        let split = payload.find('复').expect("fixture contains multibyte text") + 1;
        let mut buffer = Vec::new();

        assert!(take_complete_lines(&mut buffer, &bytes[..split]).is_empty());
        let lines = take_complete_lines(&mut buffer, &bytes[split..]);

        assert_eq!(lines.len(), 1);
        let parsed: OllamaStreamResponse =
            serde_json::from_slice(&lines[0]).expect("split JSON remains valid");
        assert_eq!(parsed.message.expect("message is present").content, "修复");
        assert!(buffer.is_empty());
    }

    #[test]
    fn assistant_requires_explicit_enablement_and_complete_provider_config() {
        let mut config = AssistantConfig::default();
        config.enabled = false;
        assert_eq!(
            GameAssistant::validate_config(&config),
            Err("Assistant is disabled".to_string())
        );

        config.enabled = true;
        config.ollama_model.clear();
        assert_eq!(
            GameAssistant::validate_config(&config),
            Err("Ollama model is not configured".to_string())
        );
    }
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

pub struct AssistantState {
    pub assistant: Arc<Mutex<GameAssistant>>,
}

impl AssistantState {
    pub fn new() -> Self {
        Self {
            assistant: Arc::new(Mutex::new(GameAssistant::new())),
        }
    }
}
