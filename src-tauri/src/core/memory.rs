use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use sysinfo::System;
use ts_rs::TS;

const MIB: u64 = 1024 * 1024;
const MIN_HEAP_MB: u32 = 512;
const DEFAULT_INITIAL_HEAP_MB: u32 = 1_024;
const MIN_SYSTEM_RESERVE_MB: u32 = 1_536;
const MAX_SYSTEM_RESERVE_MB: u32 = 4_096;
const MAX_AUTO_HEAP_MB: u32 = 12_288;
const HEAP_STEP_MB: u32 = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemorySnapshot {
    pub total_mb: u64,
    pub available_mb: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export, export_to = "memory.ts")]
pub enum MemoryWorkload {
    Vanilla,
    Light,
    Moderate,
    Heavy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export, export_to = "memory.ts")]
pub enum MemoryPressure {
    Healthy,
    Constrained,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export, export_to = "memory.ts")]
pub enum MemoryAllocationSource {
    Automatic,
    GlobalManual,
    InstanceOverride,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "memory.ts")]
pub struct MemoryAllocation {
    pub total_memory_mb: u32,
    pub available_memory_mb: u32,
    pub reserved_memory_mb: u32,
    pub target_memory_mb: u32,
    pub headroom_mb: u32,
    pub recommended_min_mb: u32,
    pub recommended_max_mb: u32,
    pub applied_min_mb: u32,
    pub applied_max_mb: u32,
    pub mod_count: u32,
    pub workload: MemoryWorkload,
    pub pressure: MemoryPressure,
    pub source: MemoryAllocationSource,
}

pub struct MemoryState {
    system: Mutex<System>,
}

impl MemoryState {
    pub fn new() -> Self {
        Self {
            system: Mutex::new(System::new()),
        }
    }

    pub fn snapshot(&self) -> Result<MemorySnapshot, String> {
        let mut system = self
            .system
            .lock()
            .map_err(|_| "System memory monitor is unavailable".to_string())?;
        system.refresh_memory();

        let total_mb = system.total_memory() / MIB;
        let available_mb = system.available_memory() / MIB;
        if total_mb == 0 {
            return Err("System memory information is unavailable".to_string());
        }

        Ok(MemorySnapshot {
            total_mb,
            available_mb: available_mb.min(total_mb),
        })
    }
}

impl Default for MemoryState {
    fn default() -> Self {
        Self::new()
    }
}

fn to_u32(value: u64) -> u32 {
    value.min(u32::MAX as u64) as u32
}

fn round_down(value: u32, step: u32) -> u32 {
    value / step * step
}

fn round_up(value: u32, step: u32) -> u32 {
    value.saturating_add(step - 1) / step * step
}

fn system_reserve(total_mb: u32) -> u32 {
    (total_mb.saturating_mul(15) / 100).clamp(MIN_SYSTEM_RESERVE_MB, MAX_SYSTEM_RESERVE_MB)
}

fn workload_for(mod_count: u32, is_modded: bool) -> MemoryWorkload {
    if !is_modded {
        MemoryWorkload::Vanilla
    } else if mod_count <= 50 {
        MemoryWorkload::Light
    } else if mod_count <= 150 {
        MemoryWorkload::Moderate
    } else {
        MemoryWorkload::Heavy
    }
}

fn workload_target(mod_count: u32, is_modded: bool) -> u32 {
    if !is_modded {
        3_072
    } else {
        round_up(
            3_072u32.saturating_add(mod_count.saturating_mul(32)),
            HEAP_STEP_MB,
        )
        .min(MAX_AUTO_HEAP_MB)
    }
}

fn manual_pressure(
    snapshot: MemorySnapshot,
    max_memory_mb: u32,
    reserve_mb: u32,
) -> MemoryPressure {
    let available_mb = to_u32(snapshot.available_mb);
    if available_mb.saturating_mul(10) < max_memory_mb.saturating_mul(9) {
        MemoryPressure::Critical
    } else if available_mb.saturating_sub(max_memory_mb) < reserve_mb {
        MemoryPressure::Constrained
    } else {
        MemoryPressure::Healthy
    }
}

pub fn recommend_memory(
    snapshot: MemorySnapshot,
    mod_count: u32,
    is_modded: bool,
) -> MemoryAllocation {
    let total_memory_mb = to_u32(snapshot.total_mb);
    let available_memory_mb = to_u32(snapshot.available_mb.min(snapshot.total_mb));
    let reserved_memory_mb = system_reserve(total_memory_mb);
    let target_memory_mb = workload_target(mod_count, is_modded);
    let safe_capacity_mb = round_down(
        available_memory_mb.saturating_sub(reserved_memory_mb),
        HEAP_STEP_MB,
    );
    let recommended_max_mb = safe_capacity_mb.min(target_memory_mb).max(MIN_HEAP_MB);
    let recommended_min_mb = DEFAULT_INITIAL_HEAP_MB.min(recommended_max_mb);
    let pressure = if safe_capacity_mb < MIN_HEAP_MB {
        MemoryPressure::Critical
    } else if recommended_max_mb < target_memory_mb {
        MemoryPressure::Constrained
    } else {
        MemoryPressure::Healthy
    };

    MemoryAllocation {
        total_memory_mb,
        available_memory_mb,
        reserved_memory_mb,
        target_memory_mb,
        headroom_mb: available_memory_mb.saturating_sub(recommended_max_mb),
        recommended_min_mb,
        recommended_max_mb,
        applied_min_mb: recommended_min_mb,
        applied_max_mb: recommended_max_mb,
        mod_count,
        workload: workload_for(mod_count, is_modded),
        pressure,
        source: MemoryAllocationSource::Automatic,
    }
}

pub fn resolve_memory_allocation(
    snapshot: MemorySnapshot,
    mod_count: u32,
    is_modded: bool,
    automatic: bool,
    global: (u32, u32),
    instance_override: Option<(u32, u32)>,
) -> MemoryAllocation {
    let mut allocation = recommend_memory(snapshot, mod_count, is_modded);
    let selected = if let Some(instance_memory) = instance_override {
        Some((instance_memory, MemoryAllocationSource::InstanceOverride))
    } else if !automatic {
        Some((global, MemoryAllocationSource::GlobalManual))
    } else {
        None
    };

    if let Some(((min_memory_mb, max_memory_mb), source)) = selected {
        allocation.applied_min_mb = min_memory_mb;
        allocation.applied_max_mb = max_memory_mb;
        allocation.headroom_mb = allocation.available_memory_mb.saturating_sub(max_memory_mb);
        allocation.pressure = if min_memory_mb == 0 || max_memory_mb < min_memory_mb {
            MemoryPressure::Critical
        } else {
            manual_pressure(snapshot, max_memory_mb, allocation.reserved_memory_mb)
        };
        allocation.source = source;
    }

    allocation
}

pub fn count_mod_files(mods_dir: &Path) -> u32 {
    let Ok(entries) = std::fs::read_dir(mods_dir) else {
        return 0;
    };

    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    matches!(
                        extension.to_ascii_lowercase().as_str(),
                        "jar" | "zip" | "litemod"
                    )
                })
        })
        .count()
        .min(u32::MAX as usize) as u32
}

pub fn is_heap_argument(argument: &str) -> bool {
    argument.starts_with("-Xmx") || argument.starts_with("-Xms")
}

pub fn sanitize_instance_jvm_arguments(arguments: &str) -> Vec<String> {
    arguments
        .split_whitespace()
        .filter(|argument| !is_heap_argument(argument))
        .map(str::to_string)
        .collect()
}

pub fn insert_instance_jvm_arguments(args: &mut Vec<String>, main_class: &str, arguments: &str) {
    let custom_jvm_args = sanitize_instance_jvm_arguments(arguments);
    if custom_jvm_args.is_empty() {
        return;
    }

    let main_class_pos = args
        .iter()
        .position(|argument| argument == main_class)
        .unwrap_or(args.len());
    args.splice(main_class_pos..main_class_pos, custom_jvm_args);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn vanilla_recommendation_balances_target_and_headroom() {
        let recommendation = recommend_memory(
            MemorySnapshot {
                total_mb: 16_384,
                available_mb: 12_288,
            },
            0,
            false,
        );

        assert_eq!(recommendation.recommended_min_mb, 1_024);
        assert_eq!(recommendation.recommended_max_mb, 3_072);
        assert_eq!(recommendation.reserved_memory_mb, 2_457);
        assert_eq!(recommendation.workload, MemoryWorkload::Vanilla);
        assert_eq!(recommendation.pressure, MemoryPressure::Healthy);
    }

    #[test]
    fn modded_recommendation_scales_with_mod_count() {
        let recommendation = recommend_memory(
            MemorySnapshot {
                total_mb: 32_768,
                available_mb: 24_576,
            },
            160,
            true,
        );

        assert_eq!(recommendation.recommended_max_mb, 8_192);
        assert_eq!(recommendation.workload, MemoryWorkload::Heavy);
        assert_eq!(recommendation.pressure, MemoryPressure::Healthy);
    }

    #[test]
    fn automatic_recommendation_respects_current_available_memory() {
        let recommendation = recommend_memory(
            MemorySnapshot {
                total_mb: 8_192,
                available_mb: 4_096,
            },
            120,
            true,
        );

        assert_eq!(recommendation.recommended_min_mb, 1_024);
        assert_eq!(recommendation.recommended_max_mb, 2_560);
        assert_eq!(recommendation.workload, MemoryWorkload::Moderate);
        assert_eq!(recommendation.pressure, MemoryPressure::Constrained);
    }

    #[test]
    fn recommendation_is_critical_when_only_the_minimum_heap_fits() {
        let recommendation = recommend_memory(
            MemorySnapshot {
                total_mb: 4_096,
                available_mb: 1_800,
            },
            0,
            false,
        );

        assert_eq!(recommendation.recommended_min_mb, 512);
        assert_eq!(recommendation.recommended_max_mb, 512);
        assert_eq!(recommendation.pressure, MemoryPressure::Critical);
    }

    #[test]
    fn instance_override_wins_over_automatic_memory() {
        let allocation = resolve_memory_allocation(
            MemorySnapshot {
                total_mb: 16_384,
                available_mb: 12_288,
            },
            20,
            true,
            true,
            (1_024, 4_096),
            Some((2_048, 6_144)),
        );

        assert_eq!(allocation.applied_min_mb, 2_048);
        assert_eq!(allocation.applied_max_mb, 6_144);
        assert_eq!(allocation.source, MemoryAllocationSource::InstanceOverride);
    }

    #[test]
    fn global_manual_allocation_is_checked_against_available_memory() {
        let allocation = resolve_memory_allocation(
            MemorySnapshot {
                total_mb: 16_384,
                available_mb: 4_096,
            },
            0,
            false,
            false,
            (2_048, 8_192),
            None,
        );

        assert_eq!(allocation.applied_min_mb, 2_048);
        assert_eq!(allocation.applied_max_mb, 8_192);
        assert_eq!(allocation.source, MemoryAllocationSource::GlobalManual);
        assert_eq!(allocation.pressure, MemoryPressure::Critical);
    }

    #[test]
    fn mod_counter_only_includes_enabled_archive_files() {
        let test_dir =
            std::env::temp_dir().join(format!("dropout-memory-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(test_dir.join("nested.jar")).unwrap();
        fs::write(test_dir.join("fabric-api.jar"), []).unwrap();
        fs::write(test_dir.join("pack.ZIP"), []).unwrap();
        fs::write(test_dir.join("legacy.litemod"), []).unwrap();
        fs::write(test_dir.join("disabled.jar.disabled"), []).unwrap();
        fs::write(test_dir.join("notes.txt"), []).unwrap();

        assert_eq!(count_mod_files(&test_dir), 3);

        fs::remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn instance_jvm_arguments_cannot_override_resolved_heap() {
        let mut arguments = vec![
            "-Xmx4096M".to_string(),
            "-Xms1024M".to_string(),
            "net.minecraft.client.main.Main".to_string(),
            "--username".to_string(),
        ];
        insert_instance_jvm_arguments(
            &mut arguments,
            "net.minecraft.client.main.Main",
            "-Ddropout.profile=fast -Xmx16G -Xms8G -XX:+UseZGC",
        );

        assert_eq!(
            arguments,
            vec![
                "-Xmx4096M",
                "-Xms1024M",
                "-Ddropout.profile=fast",
                "-XX:+UseZGC",
                "net.minecraft.client.main.Main",
                "--username",
            ]
        );
    }
}
