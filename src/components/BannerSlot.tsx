'use client';

import { useState, useEffect } from 'react';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  linkUrl: string;
  imageUrl: string | null;
}

// 광고 배너 슬롯 — 활성 배너가 없으면 아무것도 렌더링하지 않음
export default function BannerSlot({ position }: { position: 'community' | 'home' }) {
  const [banners, setBanners] = useState<Banner[]>([]);

  useEffect(() => {
    fetch(`/api/banners?position=${position}`)
      .then((r) => (r.ok ? r.json() : { banners: [] }))
      .then((d) => setBanners(d.banners ?? []))
      .catch(() => {});
  }, [position]);

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {banners.map((b) => (
        <a
          key={b.id}
          href={b.linkUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 hover:border-blue-300 transition-colors"
        >
          <div className="flex items-center gap-4">
            {b.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.imageUrl} alt={b.title} className="h-12 w-auto rounded object-contain shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] px-1 py-0.5 bg-gray-200 text-gray-500 rounded shrink-0">AD</span>
                <span className="font-semibold text-sm text-gray-800 truncate">{b.title}</span>
              </div>
              {b.subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{b.subtitle}</p>}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
