#include "DHT.h"

// Simple DHT Test for Wokwi
#define DHTTYPE DHT22
DHT dht1(4, DHTTYPE);
DHT dht2(5, DHTTYPE);
DHT dht3(15, DHTTYPE);

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== DHT Test Starting ===");

  dht1.begin();
  dht2.begin();
  dht3.begin();

  Serial.println("Waiting 3 seconds for DHT to stabilize...");
  delay(3000);
  Serial.println("DHT initialized!\n");
}

void loop() {
  Serial.println("--- Reading DHT Sensors ---");

  float t1 = dht1.readTemperature();
  float h1 = dht1.readHumidity();

  float t2 = dht2.readTemperature();
  float h2 = dht2.readHumidity();

  float t3 = dht3.readTemperature();
  float h3 = dht3.readHumidity();

  Serial.println("\nDHT1:");
  Serial.print("  Temperature: ");
  Serial.print(t1);
  Serial.println(" °C");
  Serial.print("  Humidity: ");
  Serial.print(h1);
  Serial.println(" %");
  Serial.print("  IsNaN? ");
  Serial.println(isnan(t1) ? "YES" : "NO");

  Serial.println("\nDHT2:");
  Serial.print("  Temperature: ");
  Serial.print(t2);
  Serial.println(" °C");
  Serial.print("  Humidity: ");
  Serial.print(h2);
  Serial.println(" %");
  Serial.print("  IsNaN? ");
  Serial.println(isnan(t2) ? "YES" : "NO");

  Serial.println("\nDHT3:");
  Serial.print("  Temperature: ");
  Serial.print(t3);
  Serial.println(" °C");
  Serial.print("  Humidity: ");
  Serial.print(h3);
  Serial.println(" %");
  Serial.print("  IsNaN? ");
  Serial.println(isnan(t3) ? "YES" : "NO");

  Serial.println("\n⏱️  Waiting 5 seconds...\n");
  delay(5000);
}
