import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { buildCheckInQrUrl } from '../utils/qrUrl';

interface EventQrThumbnailProps {
  eventId: string;
  eventTitle: string;
  publicAppUrl?: string;
  onClick: () => void;
}

export default function EventQrThumbnail({
  eventId,
  eventTitle,
  publicAppUrl,
  onClick,
}: EventQrThumbnailProps) {
  const [src, setSrc] = useState<string>('');
  const { url: checkInUrl } = buildCheckInQrUrl(eventId, publicAppUrl);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(checkInUrl, {
      width: 160,
      margin: 1,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch((err) => {
        console.error('Thumbnail QR error:', err);
      });
    return () => {
      active = false;
    };
  }, [checkInUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Open full QR poster for ${eventTitle}`}
      aria-label={`Open full QR code for ${eventTitle}`}
      className="w-16 h-16 rounded-xl border border-slate-200 bg-white p-1 shrink-0 hover:border-blue-500 hover:ring-2 hover:ring-blue-100 transition-all flex items-center justify-center overflow-hidden"
    >
      {src ? (
        <img
          src={src}
          alt={`QR code for ${eventTitle}`}
          className="w-full h-full object-contain"
        />
      ) : (
        <span className="text-[10px] text-slate-400">QR</span>
      )}
    </button>
  );
}
