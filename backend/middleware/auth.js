const { ethers } = require('ethers');

// Frontend signs: ethers.signMessage(`Glyph login: ${wallet}`)
// and sends { wallet, signature } in the Authorization header as JSON base64

function verifyWallet(req, res, next) {
  try {
    const header = req.headers['x-glyph-auth'];
    if (!header) return res.status(401).json({ error: 'No auth header' });

    const { wallet, signature } = JSON.parse(Buffer.from(header, 'base64').toString());
    const message = `Glyph login: ${wallet.toLowerCase()}`;
    const recovered = ethers.verifyMessage(message, signature);

    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: 'Signature mismatch' });
    }

    req.wallet = ethers.getAddress(wallet); // checksummed
    next();
  } catch {
    res.status(401).json({ error: 'Invalid auth' });
  }
}

module.exports = { verifyWallet };
