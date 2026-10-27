/**
 * Écran d'erreur lisible (configuration invalide, WebGL indisponible…).
 */
export function showErrorScreen(title: string, problems: string[], hint?: string): void {
  const root = document.getElementById('ui')!;
  root.querySelector('.ecran-erreur')?.remove();
  const el = document.createElement('section');
  el.className = 'ecran-erreur';
  el.setAttribute('role', 'alert');

  const h = document.createElement('h1');
  h.textContent = title;
  el.appendChild(h);

  const list = document.createElement('ul');
  for (const p of problems) {
    const li = document.createElement('li');
    li.textContent = p;
    list.appendChild(li);
  }
  el.appendChild(list);

  if (hint) {
    const p = document.createElement('p');
    p.className = 'astuce';
    p.textContent = hint;
    el.appendChild(p);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bouton';
  btn.textContent = 'Recharger la page';
  btn.addEventListener('click', () => location.reload());
  el.appendChild(btn);
  root.appendChild(el);
}
