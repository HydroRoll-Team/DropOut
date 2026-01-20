use crate::core::config::FeatureFlags;
use crate::core::game_version::Rule;
use std::env;

pub fn is_library_allowed(rules: &Option<Vec<Rule>>, features: Option<&FeatureFlags>) -> bool {
    // If no rules, it's allowed by default
    let Some(rules) = rules else {
        return true;
    };

    if rules.is_empty() {
        return true;
    }

    // Default depends on the first rule theoretically, but usually "allow" if no "disallow" matches?
    // Actually MC logic: implicit disallow? No, implicit allow usually?
    // Official launcher Rule logic:
    // "Libraries are allowed unless restricted by a rule."
    // Actually detailed logic:
    // Check all rules. if action is "allow" and condition matches, allowed = true.
    // if action is "disallow" and condition matches, allowed = false.
    // Typically base state is false if rules exist? No.
    // Let's check common pattern.
    // Usually: [ {action: allow}, {action: disallow, os: "osx"} ]
    // This implies base allowed, but OS X disallowed.
    // Pattern 2: [ {action: allow, os: "osx"} ]
    // This implies ONLY osx allowed?

    // Correct logic:
    // If rules are present, start with result = false (deny all).
    // Loop through rules. If a rule applies (os matches), update result to (action == "allow").
    // Wait, let's verify.
    // If the list is [ {action: allow} ], result becomes true.
    // If list is [ {action: allow}, {action: disallow, os: "osx"} ].
    // On Linux: Rule 1 matches -> true. Rule 2 (osx) doesn't match -> ignore. Final: true.
    // On OSX: Rule 1 matches -> true. Rule 2 matches -> false. Final: false.

    // So: Start false. Apply rules in order.

    let mut allowed = false;

    for rule in rules {
        if rule_matches(rule, features) {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

fn rule_matches(rule: &Rule, features: Option<&FeatureFlags>) -> bool {
    // Feature-based rules: apply only if all listed features evaluate to true
    if let Some(f) = &rule.features {
        if let Some(map) = f.as_object() {
            // If no feature flags provided, we cannot satisfy feature rules
            let ctx = match features {
                Some(ff) => ff,
                None => return false,
            };

            for (key, val) in map.iter() {
                let required = val.as_bool().unwrap_or(false);
                // Map known features
                let actual = match key.as_str() {
                    "is_demo_user" => ctx.demo_user,
                    "has_quick_plays_support" => ctx.quick_play_enabled,
                    "is_quick_play_singleplayer" => {
                        ctx.quick_play_enabled && ctx.quick_play_singleplayer
                    }
                    "is_quick_play_multiplayer" => {
                        ctx.quick_play_enabled
                            && ctx
                                .quick_play_multiplayer_server
                                .as_ref()
                                .map(|s| !s.is_empty())
                                .unwrap_or(false)
                    }
                    _ => false,
                };
                if required && !actual {
                    return false;
                }
                if !required && actual {
                    // If rule specifies feature must be false, but it's true, do not match
                    return false;
                }
            }
        } else {
            // Malformed features object
            return false;
        }
    }

    match &rule.os {
        None => true, // No OS condition means it applies to all
        Some(os_rule) => {
            // Check OS name
            if let Some(os_name) = &os_rule.name {
                let os_match = match os_name.as_str() {
                    "osx" | "macos" => env::consts::OS == "macos",
                    "linux" => env::consts::OS == "linux",
                    "windows" => env::consts::OS == "windows",
                    _ => false, // Unknown OS name in rule
                };

                if !os_match {
                    return false;
                }
            }

            // Check architecture if specified
            if let Some(arch) = &os_rule.arch {
                let current_arch = env::consts::ARCH;
                // Strict match: only exact architecture or known compatibility mapping
                let compatible = match (arch.as_str(), current_arch) {
                    ("x86_64", "x86_64") => true,
                    ("x86", "x86") => true,
                    ("aarch64", "aarch64") => true,
                    // Treat "x86" not as matching x86_64 (be strict)
                    _ => arch == current_arch,
                };
                if !compatible {
                    return false;
                }
            }

            // Check version if specified (for OS version compatibility)
            if let Some(_version) = &os_rule.version {
                // Version checking would require parsing OS version strings
                // For now, we accept all versions (conservative approach)
                // In the future, parse version and compare
            }

            true
        }
    }
}
