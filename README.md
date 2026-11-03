# Halı Saha Kadro

Telefon-first FIFA tarzı halı saha kadro uygulaması.

## Özellikler

- 6 / 7 / 8 kişi, opsiyonel kaleci
- Bölgeler: Kaleci · Defans · Ortasaha · Forvet
- Yuvarlağı sürükle → bölgeye bırak → otomatik grid
- İsim: `Ahmet Yılmaz` → sahada `A. Yılmaz` (dokunarak düzenle)
- Gol sayısı → geçmişte ⚽ ikonu
- Gol krallığı + anonim maçın adamı oyları (kendine oy yok; voter→aday saklanmaz)
- Editör girişi (PIN, varsayılan `pazartesi`); `?view=share` salt okunur
- Kişi kaydı + opsiyonel foto (yuvarlak içinde)
- PNG indir (WhatsApp)

## Çalıştırma

```bash
npm install
npm run dev
```

## Veri

Şimdilik **tarayıcı localStorage** (ücretsiz). Çok cihaz / bulut için hazır şema: [`supabase/schema.sql`](supabase/schema.sql).

Yeni Supabase projesi bu org’da ~$10/ay görünüyor; onaylarsan bağlarız. Alternatif: mevcut boş bir free-tier proje.

Canlı: https://hali-saha-kadro.vercel.app
