// Eseguito in <head> (non-modulo) per evitare il flash di tema sbagliato.
(function () {
  try {
    var t = localStorage.getItem('ale.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage non disponibile: si usa il tema di sistema */ }
})();
