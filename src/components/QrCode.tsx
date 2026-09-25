import QRCode from 'qrcode';

export async function QrCode({ url, size = 160 }: { url: string; size?: number }) {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1f3a', light: '#ffffff' } });
  return (
    <figure className="inline-block">
      <div style={{ width: size, height: size }} className="bg-white p-1 rounded" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={`QR code linking to ${url}`} />
      <figcaption className="text-xs muted break-all mt-1" style={{ maxWidth: size + 40 }}>
        {url}
      </figcaption>
    </figure>
  );
}
