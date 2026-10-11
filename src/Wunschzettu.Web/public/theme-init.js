// Apply the saved colour scheme before first paint, so dark mode never flashes white.
try {
  const s = localStorage.getItem('wz.scheme');
  if (s === 'light' || s === 'dark') document.documentElement.style.colorScheme = s;
} catch {}
