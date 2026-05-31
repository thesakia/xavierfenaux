<?php
declare(strict_types=1);

const MORNING_MOOD_RECIPIENT = 'morningmood@xavierfenaux.com';
const MORNING_MOOD_CC = 'fenauxft@gmail.com';

function clean_text(string $value, int $maxLength = 2000): string
{
    $value = trim($value);
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = preg_replace('/[ \t]+/', ' ', $value) ?? '';
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $maxLength, 'UTF-8');
    }

    return substr($value, 0, $maxLength);
}

function clean_header(string $value, int $maxLength = 180): string
{
    $value = clean_text($value, $maxLength);
    return str_replace(["\n", "\r"], ' ', $value);
}

function redirect_with_status(string $status): never
{
    header('Location: /?morningmood=' . rawurlencode($status) . '#interview-morning-mood', true, 303);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    redirect_with_status('error');
}

if (!empty($_POST['website'] ?? '')) {
    redirect_with_status('ok');
}

$name = clean_header((string)($_POST['name'] ?? ''));
$email = clean_header((string)($_POST['email'] ?? ''));
$phone = clean_header((string)($_POST['phone'] ?? ''));
$topic = clean_header((string)($_POST['topic'] ?? ''));
$availability = clean_text((string)($_POST['availability'] ?? ''), 3000);
$description = clean_text((string)($_POST['description'] ?? ''), 4000);

if ($name === '' || $availability === '' || $description === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    redirect_with_status('missing');
}

$subject = 'Demande interview Morning Mood - ' . $name;
$body = implode("\n\n", [
    'Nouvelle demande de rendez-vous interview Morning Mood.',
    'Format souhaite : 1h, a valider selon les creneaux proposes.',
    'Nom : ' . $name,
    'Email : ' . $email,
    'Telephone : ' . ($phone !== '' ? $phone : 'Non renseigne'),
    'Sujet / profil : ' . ($topic !== '' ? $topic : 'Non renseigne'),
    "Creneaux disponibles :\n" . $availability,
    "Description :\n" . $description,
    'Envoye depuis xavierfenaux.com',
]);

$headers = [
    'From: XavierFenaux.com <noreply@xavierfenaux.com>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Cc: ' . MORNING_MOOD_CC,
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . phpversion(),
];

$sent = mail(MORNING_MOOD_RECIPIENT, $subject, $body, implode("\r\n", $headers));

redirect_with_status($sent ? 'ok' : 'error');
