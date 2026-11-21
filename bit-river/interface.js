const file = name => new URL(name, import.meta.url).href;
const icons = {
  signal: '<path d="M2 14c4 0 4-8 8-8s4 12 8 12 4-8 8-8M2 18c4 0 4-8 8-8s4 12 8 12 4-8 8-8"/>',
  down: '<path d="M12 5v14m-5-5 5 5 5-5"/>',
  replay: '<path d="M5 10a7 7 0 1 1 1 7m-1-7V5m0 5h5"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  play: '<path d="M9 5l11 7-11 7z"/>'
};

function icon(name, viewBox = '0 0 24 24') {
  return `<svg class="icon icon-${name}" aria-hidden="true" viewBox="${viewBox}" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}

export function renderInterface(root) {
  root.innerHTML = `
    <link rel="stylesheet" href="${file('bit-river.css')}">
    <section class="scene" data-chapter="0" aria-label="The Invisible Current, an RFID transmission">
      <div class="plot">
        <div class="scene-fallback" aria-hidden="true">
          <svg class="fallback-signal" viewBox="0 0 600 400" preserveAspectRatio="none" fill="none">
            <path d="M445 147C350 106 370 279 138 280M445 147C365 126 370 267 138 280
              M445 147C350 146 390 301 138 280M445 147C370 131 385 287 138 280
              M445 147C360 111 350 255 138 280M445 147C360 141 410 290 138 280"/>
          </svg>
          <img class="fallback-card" src="${file('assets/card.webp')}" alt="" width="900" height="720" fetchpriority="high" decoding="async">
          <img class="fallback-reader" src="${file('assets/reader.webp')}" alt="" width="640" height="512" decoding="async">
        </div>
        <canvas class="world" aria-hidden="true"></canvas>
        <div class="packets" role="group" aria-label="Simulated data capsules">
          ${['ID', 'AUTH', 'DATA'].map(label => `<button class="packet" type="button" hidden
            aria-label="Inspect ${label} capsule" aria-pressed="false" aria-keyshortcuts="Delete Escape"
            aria-controls="capsule-inspection"><span aria-hidden="true">${label}</span></button>`).join('')}
        </div>
      </div>
      <header class="mast">
        <span class="identity">${icon('signal', '0 0 28 24')} Bit River</span>
        <button class="flow-toggle" type="button" aria-pressed="false" hidden>
          ${icon('pause')}${icon('play')}<span data-flow-label>Pause flow</span>
        </button>
      </header>
      <div class="copy" aria-live="polite" aria-atomic="true">
        <h2 class="headline">The Invisible Current</h2>
        <p class="caption">An RFID transmission</p>
      </div>
      <figure class="scope-panel" aria-describedby="scope-description">
        <figcaption class="scope-label">Reader carrier · 13.56 MHz</figcaption>
        <span class="sr" id="scope-description">Slowed signal traces. In the card reply, a one has a subcarrier burst in the first half of the bit, and a zero has it in the second half.</span>
        <canvas class="scope" aria-hidden="true"></canvas>
      </figure>
      <aside class="inspection" id="capsule-inspection" aria-live="polite" aria-atomic="true" hidden>
        <div class="inspection-label"></div>
        <div class="inspection-value"></div>
        <div class="inspection-binary" aria-hidden="true"></div>
      </aside>
      <div class="notice" role="status" aria-atomic="true"></div>
      <div class="live-status sr" role="status"></div>
      <footer class="navigation">
        <div class="navigation-actions">
          <button class="advance" type="button">
            <span data-advance-label>Scroll to follow</span>${icon('down')}${icon('replay')}
          </button>
          <button class="link-toggle" type="button" hidden>Compare coupling</button>
        </div>
        <span class="progress" aria-hidden="true"></span>
      </footer>
    </section>`;
}
