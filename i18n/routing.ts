//source @/src/app/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'ru', 'zh', 'pt', 'ha'],

  // Used when no locale matches
  defaultLocale: 'en'
});
