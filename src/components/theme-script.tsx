export function ThemeScript() {
  const code = `
    (function() {
      try {
        var stored = localStorage.getItem('lumio-theme');
        var theme = stored || 'system';
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
        if (resolved === 'dark') document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = resolved;
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
