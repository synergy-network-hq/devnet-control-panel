import { check } from '@tauri-apps/plugin-updater';

function normalizeUpdateError(error) {
  const text = String(error ?? '').trim();
  const lower = text.toLowerCase();

  if (
    lower.includes('updater is not configured')
    || lower.includes('empty endpoints')
    || lower.includes('endpoints')
    || lower.includes('pubkey')
  ) {
    return 'Updater is not configured yet. Configure updater endpoints + signing pubkey in tauri.conf.json, then rebuild.';
  }

  if (lower.includes('network') || lower.includes('timed out') || lower.includes('timeout')) {
    return 'Update check failed due to network/timeout. Verify internet access and updater endpoint availability.';
  }

  return `Update check failed: ${text || 'unknown error'}`;
}

export async function checkAndInstallAppUpdate() {
  try {
    const update = await check();
    if (!update) {
      return { status: 'up_to_date', message: 'No updates available. You are on the latest version.' };
    }

    const confirmInstall = window.confirm(
      `Update available: ${update.currentVersion} -> ${update.version}\n\nInstall now?`
    );
    if (!confirmInstall) {
      await update.close();
      return {
        status: 'cancelled',
        message: `Update ${update.version} is available but installation was cancelled.`,
      };
    }

    await update.downloadAndInstall();
    await update.close();

    return {
      status: 'installed',
      message: `Update ${update.version} installed. Restart the app to run the new version.`,
    };
  } catch (error) {
    return { status: 'error', message: normalizeUpdateError(error) };
  }
}
