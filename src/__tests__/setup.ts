// vitest 的全局准备：英文词典在应用里按需加载（见 i18n/index.ts），测试里预先加载好，setLocale('en') 后即可同步翻译。
import { loadLocale } from '../i18n';

await loadLocale('en');
