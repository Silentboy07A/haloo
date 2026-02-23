# Wokwi Simulation Interactive Controls

## 🎛️ Adjusting Sensor Values During Simulation

Your SaveHydroo Wokwi simulation has **interactive sensor controls** built-in! Here's how to adjust values in real-time:

### DHT22 Temperature Sensors (Adjustable)
Click on any DHT22 sensor during simulation to get sliders for:
- **Temperature**: 15°C - 40°C
- **Humidity**: 0% - 100%

**Current Sensors:**
1. **DHT1** (Pin 4): RO Reject Tank - Default: 28°C
2. **DHT2** (Pin 5): Rainwater Tank - Default: 24°C
3. **DHT3** (Pin 15): Blended Tank - Default: 26°C

### Potentiometers for TDS (Adjustable)
The TDS sensors use potentiometers - rotate them during simulation:
- **TDS1** (Pin 34): RO Reject - Set to ~75% for high TDS (~1200 ppm)
- **TDS2** (Pin 35): Rainwater - Set to ~10% for low TDS (~50 ppm)
- **TDS3** (Pin 32): Blended - Set to ~30% for medium TDS (~300 ppm)

### Ultrasonic Sensors for Water Level (Adjustable)
Click on ultrasonic sensors to adjust distance:
- **Ultrasonic1** (Pins 16/17): RO Reject Level - Default: 15 cm
- **Ultrasonic2** (Pins 18/19): Rainwater Level - Default: 20 cm
- **Ultrasonic3** (Pins 21/22): Blended Level - Default: 25 cm

## 🎮 How to Use

1. **Start the simulation** in Wokwi
2. **Click on any sensor** (DHT22, potentiometer, or ultrasonic)
3. **Drag the slider** or rotate the potentiometer
4. **Watch Serial Monitor** - values update in real-time!

## 📊 Expected Output

Your code will read and send data like:
```json
[
  {
    "tank_id": 1,
    "tds_value": 1200.00,
    "temperature": 28.00,
    "water_level": 15.00
  },
  {
    "tank_id": 2,
    "tds_value": 50.00,
    "temperature": 24.00,
    "water_level": 20.00
  },
  {
    "tank_id": 3,
    "tds_value": 300.00,
    "temperature": 26.00,
    "water_level": 25.00
  }
]
```

## 🔥 Pro Tips

- **Change temperature during simulation**: Click DHT22 → drag slider → see instant update
- **Simulate tank filling**: Decrease ultrasonic distance (e.g., 5 cm = high water level)
- **Simulate tank draining**: Increase ultrasonic distance (e.g., 100 cm = low water level)
- **Adjust TDS**: Rotate potentiometers - clockwise increases TDS reading

All sensors are **interactive by default** in Wokwi - no additional configuration needed!
