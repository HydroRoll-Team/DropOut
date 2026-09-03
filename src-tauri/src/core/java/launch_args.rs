pub fn jvm_gc_preset_args(preset: &str, java_major: u32) -> Vec<String> {
    match preset {
        "g1gc" => vec![
            "-XX:+UseG1GC".to_string(),
            "-XX:+ParallelRefProcEnabled".to_string(),
            "-XX:MaxGCPauseMillis=200".to_string(),
            "-XX:+UnlockExperimentalVMOptions".to_string(),
            "-XX:+DisableExplicitGC".to_string(),
            "-XX:+AlwaysPreTouch".to_string(),
            "-XX:G1NewSizePercent=30".to_string(),
            "-XX:G1MaxNewSizePercent=40".to_string(),
            "-XX:G1HeapRegionSize=8M".to_string(),
            "-XX:G1ReservePercent=20".to_string(),
            "-XX:G1HeapWastePercent=5".to_string(),
            "-XX:G1MixedGCCountTarget=4".to_string(),
            "-XX:InitiatingHeapOccupancyPercent=15".to_string(),
            "-XX:G1MixedGCLiveThresholdPercent=90".to_string(),
            "-XX:G1RSetUpdatingPauseTimePercent=5".to_string(),
            "-XX:SurvivorRatio=32".to_string(),
            "-XX:+PerfDisableSharedMem".to_string(),
            "-XX:MaxTenuringThreshold=1".to_string(),
        ],
        "zgc" => {
            let mut args = vec![
                "-XX:+UseZGC".to_string(),
                "-XX:+UnlockExperimentalVMOptions".to_string(),
            ];

            if java_major < 24 {
                args.push("-XX:+ZGenerational".to_string());
            }

            args.push("-XX:+AlwaysPreTouch".to_string());
            args.push("-XX:+DisableExplicitGC".to_string());
            args
        }
        "shenandoah" => vec![
            "-XX:+UseShenandoahGC".to_string(),
            "-XX:+UnlockExperimentalVMOptions".to_string(),
            "-XX:+AlwaysPreTouch".to_string(),
            "-XX:+DisableExplicitGC".to_string(),
            "-XX:ShenandoahGCHeuristics=adaptive".to_string(),
        ],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn expected_legacy_zgc_args() -> Vec<String> {
        [
            "-XX:+UseZGC",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+ZGenerational",
            "-XX:+AlwaysPreTouch",
            "-XX:+DisableExplicitGC",
        ]
        .map(str::to_string)
        .to_vec()
    }

    fn expected_modern_zgc_args() -> Vec<String> {
        [
            "-XX:+UseZGC",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+AlwaysPreTouch",
            "-XX:+DisableExplicitGC",
        ]
        .map(str::to_string)
        .to_vec()
    }

    #[test]
    fn jvm_gc_preset_args_keeps_zgenerational_on_jdk_21() {
        assert_eq!(jvm_gc_preset_args("zgc", 21), expected_legacy_zgc_args());
    }

    #[test]
    fn jvm_gc_preset_args_keeps_zgenerational_on_jdk_23() {
        assert_eq!(jvm_gc_preset_args("zgc", 23), expected_legacy_zgc_args());
    }

    #[test]
    fn jvm_gc_preset_args_omits_zgenerational_on_jdk_24() {
        assert_eq!(jvm_gc_preset_args("zgc", 24), expected_modern_zgc_args());
    }

    #[test]
    fn jvm_gc_preset_args_omits_zgenerational_on_jdk_26() {
        assert_eq!(jvm_gc_preset_args("zgc", 26), expected_modern_zgc_args());
    }

    #[test]
    fn jvm_gc_preset_args_omits_zgenerational_on_future_jdks() {
        assert_eq!(jvm_gc_preset_args("zgc", 30), expected_modern_zgc_args());
    }

    #[test]
    fn jvm_gc_preset_args_preserves_legacy_zgc_behavior_for_unknown_java() {
        assert_eq!(jvm_gc_preset_args("zgc", 0), expected_legacy_zgc_args());
    }

    #[test]
    fn jvm_gc_preset_args_keeps_g1gc_independent_of_java_version() {
        let expected = [
            "-XX:+UseG1GC",
            "-XX:+ParallelRefProcEnabled",
            "-XX:MaxGCPauseMillis=200",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+DisableExplicitGC",
            "-XX:+AlwaysPreTouch",
            "-XX:G1NewSizePercent=30",
            "-XX:G1MaxNewSizePercent=40",
            "-XX:G1HeapRegionSize=8M",
            "-XX:G1ReservePercent=20",
            "-XX:G1HeapWastePercent=5",
            "-XX:G1MixedGCCountTarget=4",
            "-XX:InitiatingHeapOccupancyPercent=15",
            "-XX:G1MixedGCLiveThresholdPercent=90",
            "-XX:G1RSetUpdatingPauseTimePercent=5",
            "-XX:SurvivorRatio=32",
            "-XX:+PerfDisableSharedMem",
            "-XX:MaxTenuringThreshold=1",
        ]
        .map(str::to_string)
        .to_vec();

        assert_eq!(jvm_gc_preset_args("g1gc", 21), expected);
        assert_eq!(jvm_gc_preset_args("g1gc", 26), expected);
    }

    #[test]
    fn jvm_gc_preset_args_keeps_shenandoah_independent_of_java_version() {
        let expected = [
            "-XX:+UseShenandoahGC",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+AlwaysPreTouch",
            "-XX:+DisableExplicitGC",
            "-XX:ShenandoahGCHeuristics=adaptive",
        ]
        .map(str::to_string)
        .to_vec();

        assert_eq!(jvm_gc_preset_args("shenandoah", 21), expected);
        assert_eq!(jvm_gc_preset_args("shenandoah", 26), expected);
    }

    #[test]
    fn jvm_gc_preset_args_returns_nothing_for_default_and_unknown_presets() {
        assert!(jvm_gc_preset_args("default", 26).is_empty());
        assert!(jvm_gc_preset_args("something-unknown", 26).is_empty());
    }
}
