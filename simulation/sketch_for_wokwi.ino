#include "DHT.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>


// -------- WIFI --------
const char *ssid = "Wokwi-GUEST";
const char *password = "";

// -------- EDGE FUNCTION --------
const char *FUNCTION_URL =
    "https://jawdhtalovhqoorwfrkt.supabase.co/functions/v1/sensor_ingest";

// -------- DHT --------
#define DHTTYPE DHT22
DHT dht1(4, DHTTYPE);
DHT dht2(5, DHTTYPE);
DHT dht3(15, DHTTYPE);

// -------- TDS --------
#define TDS1 34
#define TDS2 35
#define TDS3 32

// -------- ULTRASONIC --------
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

  long d = pulseIn(echo, HIGH, 30000);
  if (d == 0)
    return 0;
  return d * 0.034 / 2;
}

void setup() {
  Serial.begin(115200);
  delay(2000); // CRITICAL: Wait for everything to stabilize

  Serial.println("\n=== SaveHydroo Starting ===");

  // Initialize DHT sensors
  dht1.begin();
  dht2.begin();
  dht3.begin();
  delay(2000); // CRITICAL: DHT needs time

  pinMode(TRIG1, OUTPUT);
  pinMode(ECHO1, INPUT);
  pinMode(TRIG2, OUTPUT);
  pinMode(ECHO2, INPUT);
  pinMode(TRIG3, OUTPUT);
  pinMode(ECHO3, INPUT);

  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  delay(2000);
}

void loop() {
  Serial.println("\n=== Reading Sensors ===");

  // Read with delay between each sensor
  delay(100);
  float t1 = dht1.readTemperature();
  delay(100);
  float t2 = dht2.readTemperature();
  delay(100);
  float t3 = dht3.readTemperature();

  // Debug output
  Serial.print("Raw DHT1: ");
  Serial.println(t1);
  Serial.print("Raw DHT2: ");
  Serial.println(t2);
  Serial.print("Raw DHT3: ");
  Serial.println(t3);

  // Handle NaN
  if (isnan(t1)) {
    Serial.println("WARNING: DHT1 NaN!");
    t1 = 0;
  }
  if (isnan(t2)) {
    Serial.println("WARNING: DHT2 NaN!");
    t2 = 0;
  }
  if (isnan(t3)) {
    Serial.println("WARNING: DHT3 NaN!");
    t3 = 0;
  }

  float tds1 = analogRead(TDS1) / 4.095;
  float tds2 = analogRead(TDS2) / 4.095;
  float tds3 = analogRead(TDS3) / 4.095;

  float lvl1 = readLevel(TRIG1, ECHO1);
  float lvl2 = readLevel(TRIG2, ECHO2);
  float lvl3 = readLevel(TRIG3, ECHO3);

  Serial.println("\n=== SENSOR READINGS ===");
  Serial.printf("Tank 1 - Temp: %.2f°C, TDS: %.2f ppm, Level: %.2f cm\n", t1,
                tds1, lvl1);
  Serial.printf("Tank 2 - Temp: %.2f°C, TDS: %.2f ppm, Level: %.2f cm\n", t2,
                tds2, lvl2);
  Serial.printf("Tank 3 - Temp: %.2f°C, TDS: %.2f ppm, Level: %.2f cm\n", t3,
                tds3, lvl3);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, FUNCTION_URL);
  http.addHeader("Content-Type", "application/json");

  String payload = "["
                   "{"
                   "\"tank_id\":1,"
                   "\"tds_value\":" +
                   String(tds1, 2) +
                   ","
                   "\"temperature\":" +
                   String(t1, 2) +
                   ","
                   "\"water_level\":" +
                   String(lvl1, 2) +
                   "},"
                   "{"
                   "\"tank_id\":2,"
                   "\"tds_value\":" +
                   String(tds2, 2) +
                   ","
                   "\"temperature\":" +
                   String(t2, 2) +
                   ","
                   "\"water_level\":" +
                   String(lvl2, 2) +
                   "},"
                   "{"
                   "\"tank_id\":3,"
                   "\"tds_value\":" +
                   String(tds3, 2) +
                   ","
                   "\"temperature\":" +
                   String(t3, 2) +
                   ","
                   "\"water_level\":" +
                   String(lvl3, 2) +
                   "}"
                   "]";

  Serial.println("\n=== SENDING TO SUPABASE ===");
  Serial.println(payload);

  int code = http.POST(payload);

  Serial.print("\nHTTP Code: ");
  Serial.println(code);
  Serial.println(http.getString());

  http.end();

  Serial.println("\n⏱️  Waiting 5 seconds...");
  delay(5000);
}
