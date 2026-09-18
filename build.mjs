// Собирает приложение в один файл dist/pullup-diary.html: стили, скрипт и иконка встроены.
// Такой файл можно скачать на телефон и открыть без сервера.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Версия сборки: аргумент командной строки, переменная BUILD_VERSION или дата.
const version = process.argv[2] || process.env.BUILD_VERSION || new Date().toISOString().slice(0, 10);
const html = readFileSync('index.html', 'utf8');
const css = readFileSync('styles.css', 'utf8');
const js = readFileSync('app.js', 'utf8').replace(/<\/script/gi, '<\\/script').replace('__BUILD__', version);
const icon = 'data:image/svg+xml;base64,' + readFileSync('icon.svg').toString('base64');

let out = html
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${js}\n</script>`)
  .replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
  .replace('href="icon.svg" type="image/svg+xml"', `href="${icon}" type="image/svg+xml"`)
  .replace('<link rel="apple-touch-icon" href="icon.svg">', `<link rel="apple-touch-icon" href="${icon}">`);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/pullup-diary.html', out);
console.log('dist/pullup-diary.html:', (out.length / 1024).toFixed(1), 'KiB', 'version', version);

// Вариант для встраивания в страницу, у которой уже есть свой <html>/<head>/<body>:
// только <title>, <style>, разметка и <script>. Скачивание файлов там заблокировано,
// поэтому остаются «Поделиться» и копирование текстом.
const body = out.match(/<body>([\s\S]*)<\/body>/)[1];
const embed = `<title>Дневник подтягиваний</title>\n<style>\n${css}\n</style>\n<script>window.PULLUP_NO_DOWNLOAD = true;</script>${body}`;
writeFileSync('dist/pullup-diary-embed.html', embed);
console.log('dist/pullup-diary-embed.html:', (embed.length / 1024).toFixed(1), 'KiB');
