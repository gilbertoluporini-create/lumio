export function ThemeScript() {
  const code = `
    (function() {
      try {
        var stored = localStorage.getItem('lumio-theme');
        var theme = 'system';
        if (stored) { try { theme = JSON.parse(stored); } catch (e) { theme = stored; } }
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
        if (resolved === 'dark') document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = resolved;
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
