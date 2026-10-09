<?php
// Privacy-friendly counter: no cookies, no IP addresses, no user agents – only "event X happened N times on day D".
// R6S version. Data lives outside the web root (raychil.jp/r6saim-data/YYYY-MM.json – aim/r6s is three levels down) so deploys never wipe it.
header('Cache-Control: no-store');
$e = $_GET['e'] ?? '';
if (!preg_match('~^[a-z0-9/_-]{1,48}$~', $e)) { http_response_code(204); exit; }
$dir = dirname(__DIR__, 3) . '/r6saim-data';
if (!is_dir($dir) && !@mkdir($dir, 0700, true)) { http_response_code(204); exit; }
$fp = @fopen($dir . '/' . gmdate('Y-m') . '.json', 'c+');
if (!$fp) { http_response_code(204); exit; }
if (flock($fp, LOCK_EX)) {
  $data = json_decode(stream_get_contents($fp) ?: '{}', true) ?: [];
  $d = gmdate('Y-m-d');
  if (isset($data[$d][$e]) || count($data[$d] ?? []) < 300) {   // cap distinct event names per day
    $data[$d][$e] = ($data[$d][$e] ?? 0) + 1;
    ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($data));
  }
  flock($fp, LOCK_UN);
}
fclose($fp);
http_response_code(204);
