function initNav() {
  const burger = document.querySelector('.nav-burger');
  const drawer = document.querySelector('.nav-drawer');
  if (burger && drawer) {
    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      burger.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    drawer.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        drawer.classList.remove('open');
        burger.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  initWalletPill();
}

function initWalletPill() {
  const pill = document.getElementById('wallet-display');
  if (!pill) return;

  // Append dropdown to body so backdrop-filter on nav doesn't clip it
  const dropdown = document.createElement('div');
  dropdown.className = 'wallet-dropdown';
  document.body.appendChild(dropdown);

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!pill.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('open');
  });

  async function refresh() {
    // Try to get connected wallet without prompting
    const eth = window.ethereum;
    if (!eth) {
      showNotConnected();
      return;
    }
    const accounts = await eth.request({ method: 'eth_accounts' }).catch(() => []);
    if (accounts?.length) {
      showConnected(accounts[0]);
    } else {
      showNotConnected();
    }
  }

  function showNotConnected() {
    pill.textContent = 'CONNECT WALLET';
    pill.classList.add('not-connected');
    dropdown.innerHTML = '';
    pill.onclick = async (e) => {
      e.stopPropagation();
      if (typeof GLYPH !== 'undefined') {
        const addr = await GLYPH.connect();
        if (addr) refresh();
      } else {
        window.location.href = 'index.html';
      }
    };
  }

  function showConnected(addr) {
    const short = addr.slice(0, 6) + '...' + addr.slice(-4);
    pill.classList.remove('not-connected');

    // Keep text only — dropdown stays on body to avoid backdrop-filter clipping
    const textNode = document.createTextNode(short);
    pill.replaceChildren(textNode);

    // Also update drawer wallet
    const drawerWallet = document.getElementById('drawer-wallet-display');
    if (drawerWallet) drawerWallet.textContent = short;

    dropdown.innerHTML = `
      <button onclick="navigator.clipboard?.writeText('${addr}')">COPY ADDRESS</button>
      <button class="disconnect" id="disconnect-btn">DISCONNECT</button>
    `;
    document.getElementById('disconnect-btn').onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.remove('open');
      // Clear wallet state
      if (typeof GLYPH !== 'undefined') {
        // ethers doesn't have a disconnect — just redirect to landing
      }
      window.location.href = 'index.html';
    };

    pill.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    };
  }

  // Also show in drawer
  const drawerWallet = document.getElementById('drawer-wallet-display');
  if (drawerWallet) {
    const drawerBtn = document.createElement('button');
    drawerBtn.style.cssText = 'background:rgba(255,50,50,0.1);border:1px solid rgba(255,100,100,0.2);color:#ff6464;font-family:"DM Mono",monospace;font-size:10px;letter-spacing:2px;padding:10px 20px;border-radius:20px;cursor:pointer;margin-top:12px;width:100%';
    drawerBtn.textContent = 'DISCONNECT';
    drawerBtn.onclick = () => { window.location.href = 'index.html'; };
    drawerWallet.parentNode?.appendChild(drawerBtn);
  }

  refresh();
}

document.addEventListener('DOMContentLoaded', initNav);
