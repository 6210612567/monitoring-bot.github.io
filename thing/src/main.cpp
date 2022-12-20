// BMP280

#include <WiFi.h>
#include <WiFiManager.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_HTS221.h>
#include <MQTT.h>
#include <ArduinoJson.h>

const char *mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
String sensor_status = "on";

WiFiClient wifiClient;
MQTTClient mqttClient;

WiFiManager WifiManager;
Adafruit_BMP280 bmp;
Adafruit_HTS221 hts;

void setupWifi(){
  bool res;
  WiFi.mode(WIFI_AP);

  WifiManager.resetSettings();
  res = WifiManager.autoConnect("wmtest", "12345678");

  if (!res)
  {
    Serial.println("Failed to connect or timeout");
  }
  else
  {
    Serial.println("connected :)");
  }
}


void setupMqtt()
{
  mqttClient.begin(mqtt_server, 1883, wifiClient);
  while (!mqttClient.connect("ESP32Client"))
  {
    Serial.println("Connecting to MQTT broker...");
    delay(500);
  }
  Serial.println("Connected to MQTT broker");
}


void onMqttMessage(String &topic, String &status)
{

  Serial.println("Received message: " + status + " on topic: " + topic);

  if (status == "on")
  {
    Serial.println("Status On : Sent data to broker");
    sensor_status = "on";
  }

  if (status == "off")
  {
    Serial.println("Status Off : Dont sent data to broker");
    sensor_status = "off";
  }
}

void setup() {
  Serial.begin(115200);

  setupWifi();
  setupMqtt();

  Wire.begin(41, 40);
  if (bmp.begin(0x76))
  { 
    Serial.println("BMP280 sensor is ready");
  }
  if (hts.begin_I2C())
  { 
    Serial.println("HTS221 sensor is ready");
  }

  mqttClient.onMessage(onMqttMessage);

  mqttClient.subscribe("cn466/miniproject1status");

}



 
void loop() {
  static uint32_t millis_count = 0;
  sensors_event_t humidity, temp;

  if ((millis() - millis_count >= 5000) && (sensor_status == "on"))
  {
    // Change Time
    millis_count = millis();
    // Pressure
    float pressure = bmp.readPressure();
    // Temp
    hts.getEvent(&humidity, &temp);
    float temperate = temp.temperature;
    float humid = humidity.relative_humidity;

    Serial.print("temperate = ");
    Serial.print(temperate);
    Serial.print("  ");
    Serial.print("humidity = ");
    Serial.print(humid);
    Serial.print("  ");
    Serial.print("Pressure = ");
    Serial.println(pressure);
      
    StaticJsonDocument<200> doc;
    doc["temperature"] = temperate;
    doc["humidity"] = humid;
    doc["pressure"] = pressure;
    char buffer[200];
    serializeJson(doc, buffer);

    mqttClient.publish("cn466/miniproject1", buffer);
  }
  mqttClient.loop();
  delay(100);

}