'use client';
import { Select, MenuItem, FormControl, SelectChangeEvent } from '@mui/material';
import { useRouter, usePathname } from '@/i18n/navigation';

interface LanguageSelectorProps {
  language: string;
  setLanguage: (lang: string) => void;
  isMobile?: boolean;
}

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
            {selected === 'es' ? 'Es' : selected === 'en' ? 'En' : 'Fr'}
          </div>
        )}
      >
        <MenuItem value="ar">العربية (Árabe)</MenuItem>
        <MenuItem value="de">Deutsch (Alemán)</MenuItem>
        <MenuItem value="en">English (Inglés)</MenuItem>
        <MenuItem value="es">Español</MenuItem>
        <MenuItem value="fr">Français (Francés)</MenuItem>
        <MenuItem value="hi">हिन्दी (Hindi)</MenuItem>
        <MenuItem value="id">Bahasa Indonesia</MenuItem>
        <MenuItem value="ja">日本語 (Japonés)</MenuItem>
        <MenuItem value="ko">한국어 (Coreano)</MenuItem>
        <MenuItem value="ru">Русский (Ruso)</MenuItem>
        <MenuItem value="zh">中文 (Chino)</MenuItem>
        <MenuItem value="pt">Português (Portugués)</MenuItem>
        <MenuItem value="ha">Hausa</MenuItem>
      </Select>
    </FormControl>
  );
}
