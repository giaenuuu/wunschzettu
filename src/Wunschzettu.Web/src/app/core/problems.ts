import { HttpErrorResponse } from '@angular/common/http';

/** The `type` of a problem response from the API (see GiftError and friends in the backend). */
export function problemType(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const type = (error.error as { type?: string } | null)?.type;
  if (type && !type.startsWith('http')) return type;
  if (error.status === 409) return 'conflict';
  if (error.status === 429) return 'rate-limited';
  if (error.status === 0) return 'offline';
  return null;
}

/** A friendly, localized sentence for any API error. */
export function problemMessage(error: unknown): string {
  switch (problemType(error)) {
    case 'not-available':
      return $localize`:@@problem.notAvailable:Dieser Wunsch wurde gerade von jemand anderem gewählt.`;
    case 'join-existing':
      return $localize`:@@problem.joinExisting:Es läuft schon ein gemeinsames Geschenk – mach doch dort mit.`;
    case 'already-participating':
      return $localize`:@@problem.alreadyParticipating:Du schenkst diesen Wunsch bereits.`;
    case 'gift-bought':
      return $localize`:@@problem.giftBought:Das Geschenk ist als gekauft markiert. Die Organisatorin oder der Organisator muss es zuerst wieder freigeben.`;
    case 'wrong-device':
      return $localize`:@@problem.wrongDevice:Bitte bestätige zuerst deine E-Mail-Adresse, um das von diesem Gerät aus zu ändern.`;
    case 'too-many-unconfirmed':
      return $localize`:@@problem.tooManyUnconfirmed:Bitte bestätige zuerst deine E-Mail-Adresse – der Link ist in deiner Mailbox.`;
    case 'email-not-confirmed':
      return $localize`:@@problem.emailNotConfirmed:Zum gemeinsamen Schenken musst du zuerst deine E-Mail-Adresse bestätigen.`;
    case 'not-allowed':
      return $localize`:@@problem.notAllowed:Auf einer Liste, die du verwaltest oder die für dich ist, kannst du nichts reservieren.`;
    case 'group-not-allowed':
      return $localize`:@@problem.groupNotAllowed:Dieser Wunsch kann nicht gemeinsam geschenkt werden.`;
    case 'not-organizer':
      return $localize`:@@problem.notOrganizer:Das kann nur die Person, die das Geschenk organisiert.`;
    case 'invalid-login':
      return $localize`:@@problem.invalidLogin:E-Mail oder Passwort stimmen nicht.`;
    case 'weak-password':
      return $localize`:@@problem.weakPassword:Dieses Passwort ist zu schwach. Nimm mindestens 8 Zeichen.`;
    case 'invalid-url':
      return $localize`:@@problem.invalidUrl:Dieser Link funktioniert nicht. Prüfe, ob er mit https:// beginnt.`;
    case 'scrape-failed':
      return $localize`:@@problem.scrapeFailed:Die Seite konnte nicht gelesen werden. Füll die Angaben einfach selbst aus.`;
    case 'invalid-code':
      return $localize`:@@problem.invalidCode:Der Code stimmt nicht oder ist abgelaufen. Tipp auf den Button in der Mail oder fordere einen neuen Code an.`;
    case 'invalid-token':
      return $localize`:@@problem.invalidToken:Dieser Link ist ungültig, abgelaufen oder wurde schon benutzt.`;
    case 'too-many-images':
      return $localize`:@@problem.tooManyImages:Pro Wunsch sind höchstens 5 Bilder möglich.`;
    case 'too-large':
      return $localize`:@@problem.tooLarge:Das Bild ist grösser als 10 MB.`;
    case 'not-an-image':
      return $localize`:@@problem.notAnImage:Diese Datei ist kein unterstütztes Bild.`;
    case 'quota-exceeded':
      return $localize`:@@problem.quota:Dein Speicherplatz für Bilder ist aufgebraucht.`;
    case 'too-many-lists':
      return $localize`:@@problem.tooManyLists:Du hast schon die maximale Anzahl Listen.`;
    case 'last-manager':
      return $localize`:@@problem.lastManager:Eine Liste braucht mindestens eine Person, die sie verwaltet.`;
    case 'self-recipient':
      return $localize`:@@problem.selfRecipient:Damit du keine Geschenke siehst, kann nur eine andere verwaltende Person dich als beschenkte Person entfernen.`;
    case 'already-member':
      return $localize`:@@problem.alreadyMember:Diese Person ist schon dabei.`;
    case 'date-in-past':
      return $localize`:@@problem.dateInPast:Das Datum liegt in der Vergangenheit.`;
    case 'too-early':
      return $localize`:@@problem.tooEarly:Die Dankesliste gibt es erst nach dem Anlass.`;
    case 'conflict':
      return $localize`:@@problem.conflict:Gerade hat jemand anderes etwas geändert. Bitte versuch es nochmals.`;
    case 'rate-limited':
      return $localize`:@@problem.rateLimited:Zu viele Versuche. Bitte warte einen Moment.`;
    case 'offline':
      return $localize`:@@problem.offline:Keine Verbindung. Bist du online?`;
    default:
      return $localize`:@@problem.generic:Das hat nicht geklappt. Bitte versuch es nochmals.`;
  }
}
