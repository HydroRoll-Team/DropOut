/**
 * Mod Loader API service for Fabric and Forge integration.
 * This module provides functions to interact with the Tauri backend
 * for mod loader version management.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  FabricGameVersion,
  FabricLoaderVersion,
  FabricLoaderEntry,
  InstalledFabricVersion,
  ForgeVersion,
  InstalledForgeVersion,
} from "../types";

// ==================== Fabric API ====================

/**
 * Get all Minecraft versions supported by Fabric.
 */
export async function getFabricGameVersions(): Promise<FabricGameVersion[]> {
  return invoke<FabricGameVersion[]>("get_fabric_game_versions");
}

/**
 * Get all available Fabric loader versions.
 */
export async function getFabricLoaderVersions(): Promise<FabricLoaderVersion[]> {
  return invoke<FabricLoaderVersion[]>("get_fabric_loader_versions");
}

/**
 * Get Fabric loaders available for a specific Minecraft version.
 */
export async function getFabricLoadersForVersion(
  gameVersion: string,
): Promise<FabricLoaderEntry[]> {
  return invoke<FabricLoaderEntry[]>("get_fabric_loaders_for_version", {
    gameVersion,
  });
}

/**
 * Install Fabric loader for a specific Minecraft version.
 */
export async function installFabric(
  gameVersion: string,
  loaderVersion: string,
): Promise<InstalledFabricVersion> {
  return invoke<InstalledFabricVersion>("install_fabric", {
    gameVersion,
    loaderVersion,
  });
}

/**
 * List all installed Fabric versions.
 */
export async function listInstalledFabricVersions(): Promise<string[]> {
  return invoke<string[]>("list_installed_fabric_versions");
}

/**
 * Check if Fabric is installed for a specific version combination.
 */
export async function isFabricInstalled(
  gameVersion: string,
  loaderVersion: string,
): Promise<boolean> {
  return invoke<boolean>("is_fabric_installed", {
    gameVersion,
    loaderVersion,
  });
}

// ==================== Forge API ====================

/**
 * Get all Minecraft versions supported by Forge.
 */
export async function getForgeGameVersions(): Promise<string[]> {
  return invoke<string[]>("get_forge_game_versions");
}

/**
 * Get Forge versions available for a specific Minecraft version.
 */
export async function getForgeVersionsForGame(gameVersion: string): Promise<ForgeVersion[]> {
  return invoke<ForgeVersion[]>("get_forge_versions_for_game", {
    gameVersion,
  });
}

/**
 * Install Forge for a specific Minecraft version.
 */
export async function installForge(
  gameVersion: string,
  forgeVersion: string,
): Promise<InstalledForgeVersion> {
  return invoke<InstalledForgeVersion>("install_forge", {
    gameVersion,
    forgeVersion,
  });
}
