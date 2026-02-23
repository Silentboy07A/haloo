#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// WIFI
const char *ssid = "Wokwi-GUEST";
const char *password = "";

// EDGE FUNCTION - Using Vercel API (secure, validates before DB)
const char *FUNCTION_URL = "https://haloo.vercel.app/api/sensor-data";

// TDS SENSORS (Potentiometers)
#define TDS1 34
#define TDS2 35
#define TDS3 32

// TEMPERATURE SENSORS (Potentiometers - ADC1 pins only!)
#define TEMP1 33
#define TEMP2 36
#define TEMP3 39

// ULTRASONIC SENSORS
#define TRIG1 16
#define ECHO1 17
#define TRIG2 18
#define ECHO2 19
#define TRIG3 21
#define ECHO3 22

float readLevel(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);

  long duration = pulseIn(echo, HIGH, 30000);
  if (duration == 0)
    return 0;
  return duration * 0.034 / 2;
}

float readTemp(int pin) {
  int rawValue = analogRead(pin);
  return map(rawValue, 0, 4095, 15, 40);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n===================================");
  Serial.println("   SaveHydroo - Wokwi Simulation");
  Serial.println("   Real-time Adjustable Sensors");
  Serial.println("===================================\n");

  pinMode(TRIG1, OUTPUT);
  pinMode(ECHO1, INPUT);
  pinMode(TRIG2, OUTPUT);
  pinMode(ECHO2, INPUT);
  pinMode(TRIG3, OUTPUT);
  pinMode(ECHO3, INPUT);

  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!\n");
  delay(2000);
}

void loop() {
  float t1 = readTemp(TEMP1);
  float t2 = readTemp(TEMP2);
  float t3 = readTemp(TEMP3);

  float tds1 = analogRead(TDS1) / 4.095;
  float tds2 = analogRead(TDS2) / 4.095;
  float tds3 = analogRead(TDS3) / 4.095;

  float lvl1 = readLevel(TRIG1, ECHO1);
  float lvl2 = readLevel(TRIG2, ECHO2);
  float lvl3 = readLevel(TRIG3, ECHO3);

  Serial.println("Tank 1 (RO Reject):");
  Serial.printf("   Temp: %.1f C | TDS: %.1f ppm | Level: %.1f cm\n", t1, tds1,
                lvl1);

  Serial.println("Tank 2 (Rainwater):");
  Serial.printf("   Temp: %.1f C | TDS: %.1f ppm | Level: %.1f cm\n", t2, tds2,
                lvl2);

  Serial.println("Tank 3 (Blended):");
  Serial.printf("   Temp: %.1f C | TDS: %.1f ppm | Level: %.1f cm\n", t3, tds3,
                lvl3);

  String payload = "["
                   "{\"tank_id\":1,\"tds_value\":" +
                   String(tds1, 2) + ",\"temperature\":" + String(t1, 2) +
                   ",\"water_level\":" + String(lvl1, 2) +
                   "},"
                   "{\"tank_id\":2,\"tds_value\":" +
                   String(tds2, 2) + ",\"temperature\":" + String(t2, 2) +
                   ",\"water_level\":" + String(lvl2, 2) +
                   "},"
                   "{\"tank_id\":3,\"tds_value\":" +
                   String(tds3, 2) + ",\"temperature\":" + String(t3, 2) +
                   ",\"water_level\":" + String(lvl3, 2) +
                   "}"
                   "]";

  Serial.println("\nSending to Supabase...");

  // Retry logic for better success rate in Wokwi
  int httpCode = -1;
  for (int attempt = 1; attempt <= 3; attempt++) {
    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(15000);

    HTTPClient http;
    http.setTimeout(15000);

    if (http.begin(client, FUNCTION_URL)) {
      http.addHeader("Content-Type", "application/json");
      httpCode = http.POST(payload);

      if (httpCode > 0) {
        Serial.printf("HTTP: %d (Success on attempt %d)\n", httpCode, attempt);
        Serial.println(payload);
        http.end();
        break;
      } else {
        Serial.printf("Attempt %d failed (HTTP: %d), retrying...\n", attempt,
                      httpCode);
        http.end();
        delay(1000);
      }
    }
  }

  if (httpCode <= 0) {
    Serial.println("All attempts failed. Data not sent.");
    Serial.println("Data (not sent): " + payload);
  }

  Serial.println("\nWaiting 5 seconds...\n");
  delay(5000);
}
