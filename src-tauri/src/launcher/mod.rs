pub mod config;
pub mod launcher;

pub use config::Config;
pub use launcher::Launcher;

pub fn start() {
    println!("启动器启动中...");
    let config = Config::new("玩家", (1920, 1080));
    let launcher = Launcher::new(config);
    launcher.launch();
}
