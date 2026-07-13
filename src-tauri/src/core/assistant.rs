use super::config::AssistantConfig;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
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

    pub fn get_log_context(&self) -> String {
        self.log_buffer
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub async fn check_health(&self, config: &AssistantConfig) -> bool {
        if config.llm_provider == "ollama" {
            match self
                .client
                .get(format!("{}/api/tags", config.ollama_endpoint))
                .send()
                .await
            {
                Ok(res) => res.status().is_success(),
                Err(_) => false,
            }
        } else if config.llm_provider == "openai" {
            // For OpenAI, just check if API key is set
            config.openai_api_key.is_some() && !config.openai_api_key.as_ref().unwrap().is_empty()
        } else {
            false
        }
    }

    pub async fn chat(
        &self,
        mut messages: Vec<Message>,
        config: &AssistantConfig,
    ) -> Result<Message, String> {
        // Inject system prompt and log context
        if !messages.iter().any(|m| m.role == "system") {
            let context = self.get_log_context();
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
            .post(format!("{}/api/chat", config.ollama_endpoint))
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
            .post(format!("{}/chat/completions", config.openai_endpoint))
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
            .get(format!("{}/api/tags", endpoint))
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
            .get(format!("{}/models", config.openai_endpoint))
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
    ) -> Result<String, String> {
        // Inject system prompt and log context
        if !messages.iter().any(|m| m.role == "system") {
            let context = self.get_log_context();
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
            .post(format!("{}/api/chat", config.ollama_endpoint))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API returned error: {}", response.status()));
        }

        let mut full_content = String::new();
        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    let text = String::from_utf8_lossy(&chunk);
                    // Ollama returns newline-delimited JSON
                    for line in text.lines() {
                        if line.trim().is_empty() {
                            continue;
                        }
                        if let Ok(stream_response) =
                            serde_json::from_str::<OllamaStreamResponse>(line)
                        {
                            if let Some(msg) = stream_response.message {
                                full_content.push_str(&msg.content);
                                let _ = window.emit(
                                    "assistant-stream",
                                    StreamChunk {
                                        content: msg.content,
                                        done: stream_response.done,
                                        stats: None,
                                    },
                                );
                            }
                            if stream_response.done {
                                let stats = if let (
                                    Some(total),
                                    Some(load),
                                    Some(prompt_cnt),
                                    Some(prompt_dur),
                                    Some(eval_cnt),
                                    Some(eval_dur),
                                ) = (
                                    stream_response.total_duration,
                                    stream_response.load_duration,
                                    stream_response.prompt_eval_count,
                                    stream_response.prompt_eval_duration,
                                    stream_response.eval_count,
                                    stream_response.eval_duration,
                                ) {
                                    Some(GenerationStats {
                                        total_duration: total,
                                        load_duration: load,
                                        prompt_eval_count: prompt_cnt,
                                        prompt_eval_duration: prompt_dur,
                                        eval_count: eval_cnt,
                                        eval_duration: eval_dur,
                                    })
                                } else {
                                    None
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
                        }
                    }
                }
                Err(e) => {
                    return Err(format!("Stream error: {}", e));
                }
            }
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
            .post(format!("{}/chat/completions", config.openai_endpoint))
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
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    buffer.push_str(&String::from_utf8_lossy(&chunk));

                    // Process complete lines
                    while let Some(pos) = buffer.find('\n') {
                        let line = buffer[..pos].to_string();
                        buffer = buffer[pos + 1..].to_string();

                        let line = line.trim();
                        if line.is_empty() || line == "data: [DONE]" {
                            if line == "data: [DONE]" {
                                let _ = window.emit(
                                    "assistant-stream",
                                    StreamChunk {
                                        content: String::new(),
                                        done: true,
                                        stats: None,
                                    },
                                );
                            }
                            continue;
                        }

                        if let Some(data) = line.strip_prefix("data: ") {
                            if let Ok(stream_response) =
                                serde_json::from_str::<OpenAIStreamResponse>(data)
                            {
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
                            }
                        }
                    }
                }
                Err(e) => {
                    return Err(format!("Stream error: {}", e));
                }
            }
        }

        Ok(full_content)
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
