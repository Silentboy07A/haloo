#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// -------- WIFI --------
const char *ssid = "Wokwi-GUEST";
const char *password = "";

// -------- SUPABASE EDGE FUNCTION --------
const char *FUNCTION_URL =
    "https://gjwabhyztjgqurirdwhx.supabase.co/functions/v1/sensor-ingest";
const char *SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqd2FiaHl6dGpncXVyaXJkd2h4Iiwicm9sZSI6Im"
    "Fub24iLCJpYXQiOjE3NzA1NTQ5NjgsImV4cCI6MjA4NjEzMDk2OH0.MnOkq65slHUQc6LfV_"
    "sBmUcmvvnQszmzDF03BcV3AwM";

// -------- TDS SENSORS (Potentiometers → 0–1000 ppm) --------
#define TDS1_PIN 34
#define TDS2_PIN 35
#define TDS3_PIN 32

// -------- TEMPERATURE SENSORS (Potentiometers → 15–40°C) --------
#define TEMP1_PIN 33
#define TEMP2_PIN 36
#define TEMP3_PIN 39

// -------- TURBIDITY SENSORS (Potentiometers → 0–100 NTU) --------
#define TURB1_PIN 25
#define TURB2_PIN 26
#define TURB3_PIN 27

// -------- FLOW RATE SENSORS (Potentiometers → 0–5.0 L/min) --------
#define FLOW1_PIN 13
#define FLOW2_PIN 14
#define FLOW3_PIN 15

// -------- ULTRASONIC SENSORS (Water Level) --------
#define TRIG1 16
#define ECHO1 17
#define TRIG2 18
#define ECHO2 19
#define TRIG3 21
#define ECHO3 22

// -------- LEAK DETECTION (Digital pins, HIGH = leak detected) --------
#define LEAK1_PIN 4
#define LEAK2_PIN 5
#define LEAK3_PIN 23

// -------- TANK NAMES --------
const char *TANK_NAMES[3] = {"ro_reject", "rainwater", "blended"};

// -------- Helper: Read ultrasonic distance in cm --------
float readLevel(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long duration = pulseIn(echo, HIGH, 30000);
  if (duration == 0)
    return 0.0;
  return duration * 0.034 / 2.0;
}

// -------- Helper: Map analog pin to float range --------
float readAnalogMapped(int pin, float minVal, float maxVal) {
  int raw = analogRead(pin);
  return minVal + (raw / 4095.0) * (maxVal - minVal);
}

// -------- Helper: Round to 2 decimal places --------
float r2(float val) { return round(val * 100.0) / 100.0; }

// -------- Send one tank reading to Supabase --------
void sendReading(const char *tankType, float tds, float temperature,
                 float level, float flowRate, float pressure, float turbidity,
                 float flowIn, float flowOut, bool leak) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, FUNCTION_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  // Flat payload — matches sensor-ingest edge function exactly
  StaticJsonDocument<512> doc;
  doc["userId"] = (const char *)nullptr;
  doc["tank_type"] = tankType;

  JsonObject readings = doc.createNestedObject("readings");
  readings["tds"] = r2(tds);
  readings["temperature"] = r2(temperature);
  readings["level"] = r2(level);
  readings["flow_rate"] = r2(flowRate);
  readings["pressure"] = r2(pressure);
  readings["turbidity"] = r2(turbidity);
  readings["flow_in"] = r2(flowIn);
  readings["flow_out"] = r2(flowOut);
  readings["leak"] = leak;

  String payload;
  serializeJson(doc, payload);

  Serial.printf("\n📡 [%s] Sending:\n", tankType);
  Serial.println(payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.printf("✅ HTTP %d\n", httpCode);
    Serial.println("↩  " + http.getString());
  } else {
    Serial.printf("❌ Failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n═══════════════════════════════════════");
  Serial.println("   SaveHydroo — sensor_readings v2");
  Serial.println("═══════════════════════════════════════\n");

  pinMode(TRIG1, OUTPUT);
  pinMode(ECHO1, INPUT);
  pinMode(TRIG2, OUTPUT);
  pinMode(ECHO2, INPUT);
  pinMode(TRIG3, OUTPUT);
  pinMode(ECHO3, INPUT);

  pinMode(LEAK1_PIN, INPUT);
  pinMode(LEAK2_PIN, INPUT);
  pinMode(LEAK3_PIN, INPUT);

  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!\n");
  delay(1000);
}

void loop() {
  // --- Read sensors ---

  float tds[3] = {readAnalogMapped(TDS1_PIN, 0, 1000),
                  readAnalogMapped(TDS2_PIN, 0, 1000),
                  readAnalogMapped(TDS3_PIN, 0, 1000)};

  float temp[3] = {readAnalogMapped(TEMP1_PIN, 15, 40),
                   readAnalogMapped(TEMP2_PIN, 15, 40),
                   readAnalogMapped(TEMP3_PIN, 15, 40)};

  float level[3] = {readLevel(TRIG1, ECHO1), readLevel(TRIG2, ECHO2),
                    readLevel(TRIG3, ECHO3)};

  float turbidity[3] = {readAnalogMapped(TURB1_PIN, 0, 100),
                        readAnalogMapped(TURB2_PIN, 0, 100),
                        readAnalogMapped(TURB3_PIN, 0, 100)};

  // Flow sensors (0 to 5.0 L/min)
  float flowRate[3] = {readAnalogMapped(FLOW1_PIN, 0, 5.0),
                       readAnalogMapped(FLOW2_PIN, 0, 5.0),
                       readAnalogMapped(FLOW3_PIN, 0, 5.0)};

  // We reuse the same flow value for flowIn and flowOut for simulation purposes
  float flowIn[3] = {flowRate[0], flowRate[1], flowRate[2]};
  float flowOut[3] = {flowRate[0], flowRate[1], flowRate[2]};

  // Placeholders — swap with real sensor reads when available
  float pressure[3] = {1.2, 1.0, 1.5};

  bool leak[3] = {digitalRead(LEAK1_PIN) == HIGH,
                  digitalRead(LEAK2_PIN) == HIGH,
                  digitalRead(LEAK3_PIN) == HIGH};

  // --- Serial debug ---
  Serial.println("\n══════════════════════════════════════");
  for (int i = 0; i < 3; i++) {
    Serial.printf("📊 Tank %d (%s):\n", i + 1, TANK_NAMES[i]);
    Serial.printf("   TDS: %.1f ppm  | Temp: %.1f°C    | Level: %.1f cm\n",
                  tds[i], temp[i], level[i]);
    Serial.printf("   Turb: %.1f NTU | Pressure: %.2f bar\n", turbidity[i],
                  pressure[i]);
    Serial.printf("   Flow: %.2f L/m | In: %.2f L/m  | Out: %.2f L/m\n",
                  flowRate[i], flowIn[i], flowOut[i]);
    Serial.printf("   Leak: %s\n\n", leak[i] ? "⚠️  DETECTED" : "✅ None");
  }

  // --- Send each tank as a separate DB row ---
  for (int i = 0; i < 3; i++) {
    sendReading(TANK_NAMES[i], tds[i], temp[i], level[i], flowRate[i],
                pressure[i], turbidity[i], flowIn[i], flowOut[i], leak[i]);
    delay(300);
  }

  Serial.println("\n⏱️  Next reading in 5s...\n");
  delay(5000);
}
