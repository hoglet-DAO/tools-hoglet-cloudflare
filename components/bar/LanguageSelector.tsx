'use client';
import { Select, MenuItem, FormControl, SelectChangeEvent } from '@mui/material';
import { useRouter, usePathname } from '@/i18n/navigation';

interface LanguageSelectorProps {
  language: string;
  setLanguage: (lang: string) => void;
  isMobile?: boolean;
}

const LANGUAGE_LABELS: { [key: string]: string } = {
  ar: 'العربية (Árabe)',
  de: 'Deutsch (Alemán)',
  en: 'English (Inglés)',
  es: 'Español',
  fr: 'Français (Francés)',
  hi: 'हिन्दी (Hindi)',
  id: 'Bahasa Indonesia',
  ja: '日本語 (Japonés)',
  ko: '한국어 (Coreano)',
  ru: 'Русский (Ruso)',
  zh: '中文 (Chino)',
  pt: 'Português (Portugués)',
  ha: 'Hausa',
};

const SHORT_LABELS: { [key: string]: string } = {
  ar: 'Ar',
  de: 'De',
  en: 'En',
  es: 'Es',
  fr: 'Fr',
  hi: 'Hi',
  id: 'Id',
  ja: 'Ja',
  ko: 'Ko',
  ru: 'Ru',
  zh: 'Zh',
  pt: 'Pt',
  ha: 'Ha',
};

export default function LanguageSelector({ language, setLanguage, isMobile = false }: LanguageSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (event: SelectChangeEvent<string>) => {
    const newLang = event.target.value as string;
    router.push(pathname, { locale: newLang });
    setLanguage(newLang);
  };

  return (
    <FormControl sx={{ minWidth: 120 }} className={isMobile ? 'toggle-menu' : ''}>
      <Select
        className={isMobile ? 'toggle-menu' : ''}
        value={language}
        onChange={handleLanguageChange}
        displayEmpty
        sx={{
          color: 'white',
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'black' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'black' },
          '.MuiSvgIcon-root': { color: 'white' },
        }}
        MenuProps={{
          disablePortal: isMobile,
          PaperProps: {
            className: isMobile ? 'toggle-menu' : '',
            sx: { backgroundColor: 'black', color: 'white' }
          },
        }}
        renderValue={(selected) => (
          <div className="flex items-center">
            <span className="mr-2">🌍</span>
            {SHORT_LABELS[selected] ?? selected}
          </div>
        )}
      >
        {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
          <MenuItem key={code} value={code}>{label}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
