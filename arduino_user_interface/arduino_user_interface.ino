/*
 * PN532 NFC – User ID read/write interface
 *
 * Uses elechouse/PN532 library: https://github.com/elechouse/PN532
 * Install: download ZIP, extract PN532, PN532_I2C (or PN532_SPI) into Arduino/libraries.
 *
 * Supports:
 *   - Mifare Classic 1K (4-byte UID): user ID in block 4 (sector 1)
 *   - Mifare Ultralight / NTAG (7-byte UID): user ID in pages 4–7
 *
 * ========== WIRING (PN532 I2C) ==========
 *   Arduino A4 (SDA)  ->  PN532 SDA
 *   Arduino A5 (SCL)  ->  PN532 SCL
 *   Arduino 5V        ->  PN532 VCC   (or 3.3V if module is 3.3V-only)
 *   Arduino GND       ->  PN532 GND
 *
 * ========== WIRING (1602 LCD, 4-bit) ==========
 *   LCD pin   ->   Arduino
 *   --------      --------
 *   VSS       ->   GND
 *   VDD       ->   5V
 *   VO        ->   Digital 6 (PWM contrast) or 10k pot: middle=VO, ends=5V & GND
 *   RS        ->   Digital 12
 *   R/W       ->   GND
 *   E         ->   Digital 11
 *   D4        ->   Digital 5
 *   D5        ->   Digital 4
 *   D6        ->   Digital 3
 *   D7        ->   Digital 2
 *   A         ->   5V (backlight +)
 *   K         ->   GND (backlight -)
 *
 * ========== BUZZER (active) ==========
 *   Buzzer +  ->  Digital 8  (or BUZZER_PIN below)
 *   Buzzer -  ->  GND
 *   If no sound: try swapping wires, or set BUZZER_ACTIVE_LOW to 1 below.
 *
 * For SPI PN532: set USE_I2C to 0; then SS=10, SCK=13, MOSI=11, MISO=12.
 */

#include <Wire.h>
#include <string.h>
#include <PN532_I2C.h>
#include <PN532.h>
#include <LiquidCrystal.h> 

int Contrast=75;
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);  

// ---- Connection: set to 1 for I2C, 0 for SPI ----
#define USE_I2C 1

#if USE_I2C
  PN532_I2C pn532i2c(Wire);
  PN532 nfc(pn532i2c);
#else
  #include <SPI.h>
  #include <PN532_SPI.h>
  #define PN532_SS 10
  PN532_SPI pn532spi(SPI, PN532_SS);
  PN532 nfc(pn532spi);
#endif

// Mifare default key (factory default for many cards)
const uint8_t MIFARE_KEY_DEFAULT[6] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };

// User ID is stored in one block (16 bytes). Max printable length = 15 + null.
#define USER_ID_MAX_LEN  16
#define MIFARE_CLASSIC_USER_BLOCK  4   // first data block of sector 1
#define MIFARE_ULTRALIGHT_USER_PAGE 4  // first writable page (4–7 = 16 bytes)

// Menu
#define MODE_READ  1
#define MODE_WRITE 2
int menuMode = MODE_READ;

// Web app / serial protocol: "READ" or "WRITE|userid" (one line, 115200 baud)
#define CMD_BUF_LEN 32
char cmdBuf[CMD_BUF_LEN];
uint8_t cmdBufIdx = 0;
#define CARD_WAIT_MS 60000  // max time to wait for card when in command mode

#define BUZZER_PIN 8
// Set to 1 only if your buzzer beeps when the pin is LOW (default 0 = beep when HIGH)
#define BUZZER_ACTIVE_LOW 0
#if BUZZER_ACTIVE_LOW
  #define BUZZER_ON   LOW
  #define BUZZER_OFF  HIGH
#else
  #define BUZZER_ON   HIGH
  #define BUZZER_OFF  LOW
#endif

void beepSuccess() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(50);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

void beepError() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, BUZZER_ON);
    delay(50);
    digitalWrite(BUZZER_PIN, BUZZER_OFF);
    delay(40);
  }
}

static bool userIDIsEmpty(const char* id) {
  if (!id) return true;
  for (int i = 0; i < USER_ID_MAX_LEN - 1 && id[i]; i++)
    if (id[i] != ' ') return false;
  return true;
}

void lcdShowCardEmpty() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("Error"));
  lcd.setCursor(0, 1);
  lcd.print(F("Bracelet empty"));
}

// Run when PN532 not found: scan I2C bus and print tips
void scanI2CAndHalt() {
  Serial.println(F("Scanning I2C bus (SDA=A4, SCL=A5 on Uno/Nano)..."));
  uint8_t count = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("  Device at 0x")); Serial.println(addr, HEX);
      count++;
    }
    delay(5);
  }
  if (count == 0)
    Serial.println(F("  No I2C devices found."));
  Serial.println();
  Serial.println(F("Check:"));
  Serial.println(F("  - VCC to 3.3V or 5V, GND to GND"));
  Serial.println(F("  - SDA -> A4 (Uno/Nano), SCL -> A5"));
  Serial.println(F("  - Some boards: SDA/SCL are different (e.g. Mega 20/21)"));
  Serial.println(F("  - Try 0.5s delay: unplug USB, plug back, open Serial Monitor"));
  while (1) { delay(100); }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) { delay(10); }

  Serial.println(F("PN532 User ID – Read/Write (elechouse/PN532)"));
  Serial.println();

#if USE_I2C
  Wire.begin();
  delay(400);   // let PN532 power up
#endif

  nfc.begin();

  uint32_t v = nfc.getFirmwareVersion();
  if (!v) {
    Serial.println(F("PN532 not found. Check wiring (I2C/SPI)."));
#if USE_I2C
    scanI2CAndHalt();
#else
    Serial.println(F("Check SPI: SS=10, SCK=13, MOSI=11, MISO=12."));
    while (1) { delay(100); }
#endif
  }
  Serial.print(F("PN5")); Serial.print((v >> 24) & 0xFF, HEX);
  Serial.print(F(" firmware ")); Serial.print((v >> 16) & 0xFF, DEC);
  Serial.print('.'); Serial.println((v >> 8) & 0xFF, DEC);

  nfc.SAMConfig();

  delay(200);
  lcd.begin(16, 2);
  pinMode(6, OUTPUT);
  analogWrite(6, Contrast);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
  lcd.clear();
  lcdShowReaderActive();

  printMenu();
}

void lcdShowReaderActive() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("Reader is active"));
  lcd.setCursor(0, 1);
  lcd.print(F("and connected"));
}

void lcdShowUserRead(const char* userid) {
  char prefix[4] = "   ";  // first 3 chars, null-terminated
  for (int i = 0; i < 3; i++)
    prefix[i] = userid && userid[i] ? userid[i] : ' ';
  prefix[3] = '\0';
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("User ID "));
  lcd.print(F("read"));
}

// User ID on line 0, countdown on line 1 at the same time
void lcdUserReadAndCountdown(const char* userid) {
  lcdShowUserRead(userid);
  for (int i = 3; i >= 1; i--) {
    lcd.setCursor(0, 1);
    lcd.print(F("Next tap in: "));
    lcd.print(i);
    lcd.print(F("   "));
    delay(1000);
  }
  lcdShowReaderActive();
}

void lcdCountdown() {
  for (int i = 3; i >= 1; i--) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("Next tap in:"));
    lcd.setCursor(0, 1);
    lcd.print(i);
    delay(1000);
  }
  lcdShowReaderActive();
}

// Wait for card; return true and set uid/uidLen, or false on timeout
// Use a longer per-poll timeout (800ms) so the reader has time to detect the card
bool waitForCard(uint8_t *uid, uint8_t *uidLen, uint32_t timeoutMs) {
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, uidLen, 800))
      return true;
    delay(30);
  }
  return false;
}

// Get user ID string from a 16-byte block (null-terminated, max 15 chars)
void userIDFromBlock(uint8_t *block, char *out) {
  block[USER_ID_MAX_LEN - 1] = '\0';
  strncpy(out, (char*)block, USER_ID_MAX_LEN - 1);
  out[USER_ID_MAX_LEN - 1] = '\0';
}

// Fill 16-byte block from user ID string (zero-padded)
void blockFromUserID(const char *id, uint8_t *block) {
  int i = 0;
  while (i < USER_ID_MAX_LEN - 1 && id[i]) {
    block[i] = (uint8_t)id[i];
    i++;
  }
  while (i < USER_ID_MAX_LEN) block[i++] = 0;
}

// Protocol: READ -> WAITING, then OK|READ|userid or ERROR|msg
void doReadCommand() {
  Serial.println(F("WAITING"));
  uint8_t uid[8];
  uint8_t uidLen = 0;
  if (!waitForCard(uid, &uidLen, CARD_WAIT_MS)) {
    Serial.println(F("ERROR|Timeout waiting for card"));
    return;
  }
  char userid[USER_ID_MAX_LEN];
  uint8_t block[16];
  if (uidLen == 4) {
    if (!nfc.mifareclassic_AuthenticateBlock(uid, uidLen, MIFARE_CLASSIC_USER_BLOCK, 0, (uint8_t*)MIFARE_KEY_DEFAULT)) {
      Serial.println(F("ERROR|Auth failed"));
      return;
    }
    if (!nfc.mifareclassic_ReadDataBlock(MIFARE_CLASSIC_USER_BLOCK, block)) {
      Serial.println(F("ERROR|Read failed"));
      return;
    }
  } else if (uidLen == 7) {
    for (int i = 0; i < 4; i++) {
      if (!nfc.mifareultralight_ReadPage(MIFARE_ULTRALIGHT_USER_PAGE + i, block + i * 4)) {
        Serial.println(F("ERROR|Read failed"));
        return;
      }
    }
  } else {
    Serial.println(F("ERROR|Unsupported card"));
    return;
  }
  userIDFromBlock(block, userid);
  if (userIDIsEmpty(userid)) {
    Serial.println(F("ERROR|Card empty"));
    beepError();
    lcdShowCardEmpty();
    delay(3000);
    lcdShowReaderActive();
    return;
  }
  Serial.print(F("OK|READ|"));
  Serial.println(userid);
  beepSuccess();
  lcdUserReadAndCountdown(userid);
  delay(800);
}

// Protocol: WRITE|id -> WAITING, then OK|WRITE or ERROR|msg
void doWriteCommand(const char *id) {
  Serial.println(F("WAITING"));
  uint8_t uid[8];
  uint8_t uidLen = 0;
  if (!waitForCard(uid, &uidLen, CARD_WAIT_MS)) {
    Serial.println(F("ERROR|Timeout waiting for card"));
    return;
  }
  uint8_t block[16];
  blockFromUserID(id, block);
  if (uidLen == 4) {
    if (!nfc.mifareclassic_AuthenticateBlock(uid, uidLen, MIFARE_CLASSIC_USER_BLOCK, 0, (uint8_t*)MIFARE_KEY_DEFAULT)) {
      Serial.println(F("ERROR|Auth failed"));
      return;
    }
    if (!nfc.mifareclassic_WriteDataBlock(MIFARE_CLASSIC_USER_BLOCK, block)) {
      Serial.println(F("ERROR|Write failed"));
      return;
    }
  } else if (uidLen == 7) {
    for (int i = 0; i < 4; i++) {
      if (!nfc.mifareultralight_WritePage(MIFARE_ULTRALIGHT_USER_PAGE + i, block + i * 4)) {
        Serial.println(F("ERROR|Write failed"));
        return;
      }
    }
  } else {
    Serial.println(F("ERROR|Unsupported card"));
    return;
  }
  Serial.println(F("OK|WRITE"));
  beepSuccess();
  lcdCountdown();
  delay(800);
}

void loop() {
  // ---- Serial command buffer (for web app: READ / WRITE|id) ----
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      cmdBuf[cmdBufIdx] = '\0';
      if (cmdBufIdx > 0) {
        if (strcmp(cmdBuf, "READ") == 0) {
          doReadCommand();
        } else if (strncmp(cmdBuf, "WRITE|", 6) == 0) {
          const char *id = cmdBuf + 6;
          char trimId[USER_ID_MAX_LEN];
          int i = 0;
          while (i < USER_ID_MAX_LEN - 1 && id[i]) { trimId[i] = id[i]; i++; }
          trimId[i] = '\0';
          doWriteCommand(trimId);
        } else if (cmdBuf[0] == '1' && cmdBufIdx == 1) {
          menuMode = MODE_READ;
          printMenu();
        } else if (cmdBuf[0] == '2' && cmdBufIdx == 1) {
          menuMode = MODE_WRITE;
          printMenu();
        }
      }
      cmdBufIdx = 0;
      return;
    }
    if (cmdBufIdx < CMD_BUF_LEN - 1)
      cmdBuf[cmdBufIdx++] = c;
  }

  // ---- Menu mode: wait for card ----
  uint8_t uid[8];
  uint8_t uidLen;

  if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, 200))
    return;

  // Card present (Serial Monitor mode)
  Serial.println(F("\n--- Card detected ---"));
  Serial.print(F("UID (")); Serial.print(uidLen); Serial.print(F(" bytes): "));
  nfc.PrintHex(uid, uidLen);
  Serial.println();

  bool readOk = true;
  if (uidLen == 4) {
    if (menuMode == MODE_READ)
      readOk = readUserIDClassic(uid, uidLen);
    else
      writeUserIDClassic(uid, uidLen);
  } else if (uidLen == 7) {
    if (menuMode == MODE_READ)
      readOk = readUserIDUltralight();
    else
      writeUserIDUltralight();
  } else {
    Serial.println(F("Card type not supported (need 4- or 7-byte UID)."));
  }

  Serial.println(F("--- Remove card ---\n"));
  printMenu();
  if (!readOk) {
    delay(3000);
    lcdShowReaderActive();
  }
  delay(1500);
}

void printMenu() {
  Serial.println(F("Options: 1 = Read user ID  2 = Write user ID"));
  Serial.print(F("Current mode: "));
  Serial.println(menuMode == MODE_READ ? F("READ") : F("WRITE"));
  Serial.println(F("Present a card..."));
}

// ---- Mifare Classic: block 4 (sector 1) ----
bool readUserIDClassic(uint8_t *uid, uint8_t uidLen) {
  if (!nfc.mifareclassic_AuthenticateBlock(uid, uidLen, MIFARE_CLASSIC_USER_BLOCK,
                                           0, (uint8_t*)MIFARE_KEY_DEFAULT)) {
    Serial.println(F("Auth failed (wrong key?)."));
    return false;
  }

  uint8_t block[16];
  if (!nfc.mifareclassic_ReadDataBlock(MIFARE_CLASSIC_USER_BLOCK, block)) {
    Serial.println(F("Read block failed."));
    return false;
  }

  printUserIDFromBlock(block);
  char uidStr[USER_ID_MAX_LEN];
  userIDFromBlock(block, uidStr);
  if (userIDIsEmpty(uidStr)) {
    beepError();
    lcdShowCardEmpty();
    return false;
  }
  beepSuccess();
  lcdUserReadAndCountdown(uidStr);
  return true;
}

void writeUserIDClassic(uint8_t *uid, uint8_t uidLen) {
  if (!nfc.mifareclassic_AuthenticateBlock(uid, uidLen, MIFARE_CLASSIC_USER_BLOCK,
                                           0, (uint8_t*)MIFARE_KEY_DEFAULT)) {
    Serial.println(F("Auth failed (wrong key?)."));
    return;
  }

  uint8_t block[16];
  if (!getUserIDFromSerial(block)) return;

  if (!nfc.mifareclassic_WriteDataBlock(MIFARE_CLASSIC_USER_BLOCK, block)) {
    Serial.println(F("Write block failed."));
    return;
  }
  Serial.println(F("User ID written."));
  beepSuccess();
  lcdCountdown();
}

// ---- Mifare Ultralight: pages 4–7 (16 bytes) ----
bool readUserIDUltralight() {
  uint8_t block[16];
  for (int i = 0; i < 4; i++) {
    if (!nfc.mifareultralight_ReadPage(MIFARE_ULTRALIGHT_USER_PAGE + i, block + i * 4)) {
      Serial.println(F("Read page failed."));
      return false;
    }
  }
  printUserIDFromBlock(block);
  char uidStr[USER_ID_MAX_LEN];
  userIDFromBlock(block, uidStr);
  if (userIDIsEmpty(uidStr)) {
    beepError();
    lcdShowCardEmpty();
    return false;
  }
  beepSuccess();
  lcdUserReadAndCountdown(uidStr);
  return true;
}

void writeUserIDUltralight() {
  uint8_t block[16];
  if (!getUserIDFromSerial(block)) return;

  for (int i = 0; i < 4; i++) {
    if (!nfc.mifareultralight_WritePage(MIFARE_ULTRALIGHT_USER_PAGE + i, block + i * 4)) {
      Serial.println(F("Write page failed."));
      return;
    }
  }
  Serial.println(F("User ID written."));
  beepSuccess();
  lcdCountdown();
}

// ---- Helpers ----
void printUserIDFromBlock(uint8_t *block) {
  block[USER_ID_MAX_LEN - 1] = '\0'; // ensure null
  Serial.print(F("User ID: \""));
  Serial.print((char*)block);
  Serial.println(F("\""));
}

bool getUserIDFromSerial(uint8_t *block) {
  Serial.print(F("Enter user ID (max "));
  Serial.print(USER_ID_MAX_LEN - 1);
  Serial.println(F(" chars), then Enter:"));

  // Clear any leftover
  while (Serial.available()) Serial.read();

  int idx = 0;
  unsigned long start = millis();
  while (idx < USER_ID_MAX_LEN) {
    if (Serial.available()) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') break;
      block[idx++] = (uint8_t)c;
    }
    if (millis() - start > 10000) {
      Serial.println(F("Timeout."));
      return false;
    }
    delay(10);
  }

  // Pad rest with zeros
  while (idx < USER_ID_MAX_LEN)
    block[idx++] = 0;

  Serial.print(F("Writing: \""));
  block[USER_ID_MAX_LEN - 1] = '\0';
  Serial.print((char*)block);
  Serial.println(F("\""));
  block[USER_ID_MAX_LEN - 1] = 0;
  return true;
}
