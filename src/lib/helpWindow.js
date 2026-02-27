import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const HELP_WINDOW_LABEL = 'help-articles-window';

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function openHelpWindow() {
  const helpRoute = '/#/help';

  if (!isTauriRuntime()) {
    window.open(helpRoute, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const existing = await WebviewWindow.getByLabel(HELP_WINDOW_LABEL);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }

    const helpWindow = new WebviewWindow(HELP_WINDOW_LABEL, {
      title: 'Synergy Node Monitor Help',
      url: helpRoute,
      center: true,
      width: 1080,
      height: 820,
      minWidth: 860,
      minHeight: 620,
      resizable: true,
    });

    helpWindow.once('tauri://error', (event) => {
      console.error('Failed to create help window:', event.payload);
      window.open(helpRoute, '_blank', 'noopener,noreferrer');
    });
  } catch (error) {
    console.error('Help window open failed, falling back to browser tab:', error);
    window.open(helpRoute, '_blank', 'noopener,noreferrer');
  }
}
