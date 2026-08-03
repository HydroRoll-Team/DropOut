use crate::core::config::{ConfigState, LauncherConfig};
use crate::core::instance::{Instance, InstanceState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;
use ts_rs::TS;

const TRAY_ID: &str = "dropout-main-tray";
const QUICK_LAUNCH_PREFIX: &str = "quick-launch-";
const QUICK_LAUNCH_LIMIT: usize = 3;

type WryMenuItem = MenuItem<tauri::Wry>;
type WrySubmenu = Submenu<tauri::Wry>;

#[derive(Debug, Clone, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "core.ts")]
pub struct TrayDownloadStatus {
    pub active: bool,
    pub percentage: f64,
    pub status: Option<String>,
}

impl Default for TrayDownloadStatus {
    fn default() -> Self {
        Self {
            active: false,
            percentage: 0.0,
            status: None,
        }
    }
}

impl TrayDownloadStatus {
    fn normalized(mut self) -> Self {
        self.percentage = if self.percentage.is_finite() {
            self.percentage.clamp(0.0, 100.0)
        } else {
            0.0
        };
        self.status = self
            .status
            .map(|status| status.trim().chars().take(80).collect::<String>())
            .filter(|status| !status.is_empty());
        self
    }
}

pub struct TrayDownloadState(Mutex<TrayDownloadStatus>);

impl Default for TrayDownloadState {
    fn default() -> Self {
        Self(Mutex::new(TrayDownloadStatus::default()))
    }
}

struct TrayMenuState {
    toggle_window: WryMenuItem,
    quick_launch: WrySubmenu,
    quick_launch_slots: Vec<WryMenuItem>,
    downloads: WrySubmenu,
    download_status: WryMenuItem,
    open_downloads: WryMenuItem,
    quit: WryMenuItem,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLaunchRequest {
    pub instance_id: String,
    pub instance_name: String,
    pub version_id: String,
}

#[derive(Clone, Copy)]
struct TrayLabels {
    toggle_window: &'static str,
    quick_launch: &'static str,
    empty_quick_launch: &'static str,
    downloads: &'static str,
    no_downloads: &'static str,
    open_downloads: &'static str,
    downloading: &'static str,
    quit: &'static str,
    tooltip: &'static str,
    download_complete_title: &'static str,
    download_complete_body: &'static str,
    crash_title: &'static str,
}

fn tray_labels(language: &str) -> TrayLabels {
    if language.to_ascii_lowercase().starts_with("zh") {
        TrayLabels {
            toggle_window: "显示 / 隐藏窗口",
            quick_launch: "快速启动",
            empty_quick_launch: "暂无可启动实例",
            downloads: "下载管理",
            no_downloads: "当前无下载",
            open_downloads: "打开下载监视器",
            downloading: "下载中",
            quit: "退出 DropOut",
            tooltip: "DropOut Minecraft 启动器",
            download_complete_title: "下载完成",
            download_complete_body: "DropOut 已完成所有下载任务。",
            crash_title: "Minecraft 异常退出",
        }
    } else {
        TrayLabels {
            toggle_window: "Show / hide window",
            quick_launch: "Quick launch",
            empty_quick_launch: "No launchable instances",
            downloads: "Downloads",
            no_downloads: "No active downloads",
            open_downloads: "Open download monitor",
            downloading: "Downloading",
            quit: "Quit DropOut",
            tooltip: "DropOut Minecraft Launcher",
            download_complete_title: "Download complete",
            download_complete_body: "DropOut finished all download tasks.",
            crash_title: "Minecraft exited unexpectedly",
        }
    }
}

pub fn should_hide_on_close(config: &LauncherConfig) -> bool {
    config.enable_system_tray && config.close_to_tray
}

pub fn should_start_minimized(config: &LauncherConfig) -> bool {
    config.enable_system_tray && config.start_minimized_to_tray
}

pub fn should_minimize_after_launch(config: &LauncherConfig) -> bool {
    config.enable_system_tray && config.minimize_to_tray_after_launch
}

fn recent_launch_targets(instances: &[Instance]) -> Vec<TrayLaunchRequest> {
    let mut launchable = instances
        .iter()
        .filter(|instance| instance.version_id.is_some())
        .collect::<Vec<_>>();

    launchable.sort_by(|left, right| {
        right
            .last_played
            .unwrap_or(i64::MIN)
            .cmp(&left.last_played.unwrap_or(i64::MIN))
            .then_with(|| right.created_at.cmp(&left.created_at))
            .then_with(|| left.name.cmp(&right.name))
    });

    launchable
        .into_iter()
        .take(QUICK_LAUNCH_LIMIT)
        .filter_map(|instance| {
            instance
                .version_id
                .as_ref()
                .map(|version_id| TrayLaunchRequest {
                    instance_id: instance.id.clone(),
                    instance_name: instance.name.clone(),
                    version_id: version_id.clone(),
                })
        })
        .collect()
}

fn current_config(app: &AppHandle) -> LauncherConfig {
    app.state::<ConfigState>().config.lock().unwrap().clone()
}

fn current_launch_targets(app: &AppHandle) -> Vec<TrayLaunchRequest> {
    recent_launch_targets(&app.state::<InstanceState>().list_instances())
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn reveal_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

#[tauri::command]
#[dropout_macros::api]
pub fn show_main_window(app: AppHandle) {
    reveal_main_window(&app);
}

fn download_status_label(status: &TrayDownloadStatus, labels: TrayLabels) -> String {
    if !status.active {
        return labels.no_downloads.to_string();
    }

    format!(
        "{} · {:.0}%",
        status.status.as_deref().unwrap_or(labels.downloading),
        status.percentage
    )
}

fn progress_badged_icon(
    base: &tauri::image::Image<'_>,
    percentage: f64,
) -> tauri::image::Image<'static> {
    let width = base.width();
    let height = base.height();
    let mut rgba = base.rgba().to_vec();
    if width == 0
        || height == 0
        || rgba.len() != width.saturating_mul(height).saturating_mul(4) as usize
    {
        return tauri::image::Image::new_owned(rgba, width, height);
    }

    let progress = if percentage.is_finite() {
        percentage.clamp(0.0, 100.0) / 100.0
    } else {
        0.0
    };
    let radius = (width.min(height) / 4).max(2) as i32;
    let inner_radius = (radius - 2).max(1);
    let center_x = width as i32 - radius - 1;
    let center_y = height as i32 - radius - 1;
    let fill_top = center_y + inner_radius - ((inner_radius * 2) as f64 * progress).round() as i32;

    for y in (center_y - radius).max(0)..=(center_y + radius).min(height as i32 - 1) {
        for x in (center_x - radius).max(0)..=(center_x + radius).min(width as i32 - 1) {
            let dx = x - center_x;
            let dy = y - center_y;
            let distance_squared = dx * dx + dy * dy;
            if distance_squared > radius * radius {
                continue;
            }

            let pixel = ((y as u32 * width + x as u32) * 4) as usize;
            let color = if distance_squared > inner_radius * inner_radius {
                [255, 255, 255, 255]
            } else if y >= fill_top {
                [16, 185, 129, 255]
            } else {
                [15, 23, 42, 255]
            };
            rgba[pixel..pixel + 4].copy_from_slice(&color);
        }
    }

    tauri::image::Image::new_owned(rgba, width, height)
}

pub fn refresh_tray(app: &AppHandle) -> Result<(), String> {
    let config = current_config(app);
    let labels = tray_labels(&config.language);
    let menu = app.state::<TrayMenuState>();
    let targets = current_launch_targets(app);
    let download = app.state::<TrayDownloadState>().0.lock().unwrap().clone();

    menu.toggle_window
        .set_text(labels.toggle_window)
        .map_err(|error| error.to_string())?;
    menu.quick_launch
        .set_text(labels.quick_launch)
        .map_err(|error| error.to_string())?;
    menu.quick_launch
        .set_enabled(!targets.is_empty())
        .map_err(|error| error.to_string())?;

    for (index, slot) in menu.quick_launch_slots.iter().enumerate() {
        if let Some(target) = targets.get(index) {
            slot.set_text(format!(
                "{} · Minecraft {}",
                target.instance_name, target.version_id
            ))
            .map_err(|error| error.to_string())?;
            slot.set_enabled(true).map_err(|error| error.to_string())?;
        } else {
            slot.set_text(labels.empty_quick_launch)
                .map_err(|error| error.to_string())?;
            slot.set_enabled(false).map_err(|error| error.to_string())?;
        }
    }

    menu.downloads
        .set_text(labels.downloads)
        .map_err(|error| error.to_string())?;
    menu.download_status
        .set_text(download_status_label(&download, labels))
        .map_err(|error| error.to_string())?;
    menu.open_downloads
        .set_text(labels.open_downloads)
        .map_err(|error| error.to_string())?;
    menu.quit
        .set_text(labels.quit)
        .map_err(|error| error.to_string())?;

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_visible(config.enable_system_tray)
            .map_err(|error| error.to_string())?;
        if let Some(base_icon) = app.default_window_icon() {
            let icon = if download.active {
                progress_badged_icon(base_icon, download.percentage)
            } else {
                base_icon.clone().to_owned()
            };
            tray.set_icon(Some(icon))
                .map_err(|error| error.to_string())?;
        }
        let tooltip = if download.active {
            format!(
                "{} · {:.0}% · {}",
                labels.tooltip,
                download.percentage,
                download.status.as_deref().unwrap_or(labels.downloading)
            )
        } else {
            labels.tooltip.to_string()
        };
        tray.set_tooltip(Some(tooltip))
            .map_err(|error| error.to_string())?;
        tray.set_title(if download.active {
            Some(format!("{:.0}%", download.percentage))
        } else {
            None
        })
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
#[dropout_macros::api]
pub fn refresh_system_tray(app: AppHandle) -> Result<(), String> {
    refresh_tray(&app)
}

pub fn setup_system_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let config = current_config(app.handle());
    let labels = tray_labels(&config.language);

    let toggle_window =
        MenuItemBuilder::with_id("toggle-window", labels.toggle_window).build(app)?;
    let mut quick_launch_slots = Vec::with_capacity(QUICK_LAUNCH_LIMIT);
    for index in 0..QUICK_LAUNCH_LIMIT {
        quick_launch_slots.push(
            MenuItemBuilder::with_id(
                format!("{QUICK_LAUNCH_PREFIX}{index}"),
                labels.empty_quick_launch,
            )
            .enabled(false)
            .build(app)?,
        );
    }
    let quick_launch = Submenu::with_id_and_items(
        app,
        "quick-launch",
        labels.quick_launch,
        false,
        &quick_launch_slots
            .iter()
            .map(|item| item as &dyn tauri::menu::IsMenuItem<_>)
            .collect::<Vec<_>>(),
    )?;

    let download_status = MenuItemBuilder::with_id("download-status", labels.no_downloads)
        .enabled(false)
        .build(app)?;
    let open_downloads =
        MenuItemBuilder::with_id("open-downloads", labels.open_downloads).build(app)?;
    let downloads = Submenu::with_id_and_items(
        app,
        "downloads",
        labels.downloads,
        true,
        &[
            &download_status as &dyn tauri::menu::IsMenuItem<_>,
            &open_downloads as &dyn tauri::menu::IsMenuItem<_>,
        ],
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", labels.quit).build(app)?;
    let tray_menu = MenuBuilder::new(app)
        .item(&toggle_window)
        .item(&quick_launch)
        .item(&downloads)
        .item(&separator)
        .item(&quit)
        .build()?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(labels.tooltip)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle-window" => toggle_main_window(app),
            "open-downloads" => {
                reveal_main_window(app);
                let _ = app.emit("tray-open-downloads", ());
            }
            "quit" => app.exit(0),
            id if id.starts_with(QUICK_LAUNCH_PREFIX) => {
                let index = id
                    .trim_start_matches(QUICK_LAUNCH_PREFIX)
                    .parse::<usize>()
                    .ok();
                if let Some(target) =
                    index.and_then(|index| current_launch_targets(app).get(index).cloned())
                {
                    let _ = app.emit("tray-quick-launch", target);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            let should_toggle = matches!(event, TrayIconEvent::DoubleClick { .. })
                || cfg!(target_os = "macos")
                    && matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    );
            if should_toggle {
                toggle_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;

    app.manage(TrayMenuState {
        toggle_window,
        quick_launch,
        quick_launch_slots,
        downloads,
        download_status,
        open_downloads,
        quit,
    });
    refresh_tray(app.handle()).map_err(std::io::Error::other)?;

    Ok(())
}

#[tauri::command]
#[dropout_macros::api]
pub fn update_tray_download_status(
    app: AppHandle,
    state: State<'_, TrayDownloadState>,
    status: TrayDownloadStatus,
) -> Result<(), String> {
    let status = status.normalized();
    let completed = {
        let mut current = state.0.lock().unwrap();
        let completed = current.active && !status.active && status.percentage >= 100.0;
        *current = status;
        completed
    };

    refresh_tray(&app)?;

    if completed && current_config(&app).enable_system_tray {
        let labels = tray_labels(&current_config(&app).language);
        let _ = app
            .notification()
            .builder()
            .title(labels.download_complete_title)
            .body(labels.download_complete_body)
            .show();
    }

    Ok(())
}

#[tauri::command]
#[dropout_macros::api]
pub fn show_system_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    if !current_config(&app).enable_system_tray {
        return Ok(());
    }

    app.notification()
        .builder()
        .title(title.chars().take(120).collect::<String>())
        .body(body.chars().take(500).collect::<String>())
        .show()
        .map_err(|error| error.to_string())
}

pub fn notify_game_crash(app: &AppHandle, version_id: &str, exit_code: Option<i32>) {
    let config = current_config(app);
    if !config.enable_system_tray {
        return;
    }

    let labels = tray_labels(&config.language);
    let code = exit_code
        .map(|value| value.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let body = if config.language.to_ascii_lowercase().starts_with("zh") {
        format!("Minecraft {version_id} 已退出，退出代码：{code}。")
    } else {
        format!("Minecraft {version_id} exited with code {code}.")
    };
    let _ = app
        .notification()
        .builder()
        .title(labels.crash_title)
        .body(body)
        .show();
}

#[cfg(test)]
mod tests {
    use super::{
        TrayDownloadStatus, download_status_label, progress_badged_icon, recent_launch_targets,
        should_hide_on_close, should_minimize_after_launch, should_start_minimized, tray_labels,
    };
    use crate::core::config::LauncherConfig;
    use crate::core::instance::Instance;
    use std::path::PathBuf;

    fn instance(id: &str, last_played: Option<i64>, version_id: Option<&str>) -> Instance {
        Instance {
            id: id.to_string(),
            name: format!("Instance {id}"),
            game_dir: PathBuf::from(format!("/tmp/{id}")),
            version_id: version_id.map(str::to_string),
            created_at: id.parse().unwrap_or_default(),
            last_played,
            icon_path: None,
            notes: None,
            mod_loader: None,
            mod_loader_version: None,
            jvm_args_override: None,
            memory_override: None,
            java_path_override: None,
            server_address: None,
            skin_path: None,
        }
    }

    #[test]
    fn recent_quick_launch_is_sorted_limited_and_launchable() {
        let targets = recent_launch_targets(&[
            instance("1", Some(10), Some("1.20.1")),
            instance("2", Some(40), Some("1.21.1")),
            instance("3", Some(30), None),
            instance("4", Some(20), Some("1.19.4")),
            instance("5", Some(50), Some("1.21.4")),
        ]);

        assert_eq!(
            targets
                .iter()
                .map(|target| target.instance_id.as_str())
                .collect::<Vec<_>>(),
            vec!["5", "2", "4"]
        );
    }

    #[test]
    fn download_progress_is_bounded_before_display() {
        let status = TrayDownloadStatus {
            active: true,
            percentage: 140.5,
            status: Some(" Verifying ".to_string()),
        }
        .normalized();

        assert_eq!(status.percentage, 100.0);
        assert_eq!(status.status.as_deref(), Some("Verifying"));
        assert_eq!(
            download_status_label(&status, tray_labels("en")),
            "Verifying · 100%"
        );
    }

    #[test]
    fn active_download_badge_is_visible_and_bounded() {
        let base = tauri::image::Image::new_owned(vec![0; 32 * 32 * 4], 32, 32);

        let empty = progress_badged_icon(&base, -20.0);
        let half = progress_badged_icon(&base, 50.0);
        let complete = progress_badged_icon(&base, 140.0);

        assert_eq!(half.width(), 32);
        assert_eq!(half.height(), 32);
        assert_eq!(half.rgba().len(), 32 * 32 * 4);
        assert_eq!(empty.rgba()[(25 * 32 + 25) * 4 + 3], 255);
        assert_ne!(half.rgba(), base.rgba());
        assert_ne!(empty.rgba(), half.rgba());
        assert_ne!(half.rgba(), complete.rgba());
    }

    #[test]
    fn tray_lifecycle_requires_the_master_switch() {
        let mut config = LauncherConfig {
            close_to_tray: true,
            start_minimized_to_tray: true,
            minimize_to_tray_after_launch: true,
            ..LauncherConfig::default()
        };

        assert!(!should_hide_on_close(&config));
        assert!(!should_start_minimized(&config));
        assert!(!should_minimize_after_launch(&config));

        config.enable_system_tray = true;
        assert!(should_hide_on_close(&config));
        assert!(should_start_minimized(&config));
        assert!(should_minimize_after_launch(&config));
    }
}
