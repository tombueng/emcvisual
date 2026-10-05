/**
 * Public boards to try the app on, in every format it reads. They are not in the repository
 * (they belong to their projects and keep their licences); the app loads them straight from
 * GitHub, which allows cross-origin reads of raw files (and of Git LFS files through
 * media.githubusercontent.com). Each was imported and checked before it was listed.
 */
export type ExampleFormat = 'KiCad' | 'Eagle' | 'IPC-2581' | 'ODB++';

export interface ExampleBoard {
  id: string;
  name: string;
  format: ExampleFormat;
  /** What is on it, German and English. */
  de: string;
  en: string;
  license: string;
  project: string;
  url: string;
}

export const EXAMPLE_BOARDS: ExampleBoard[] = [
  {
    id: 'glasgow',
    name: 'Glasgow revC3',
    format: 'KiCad',
    de: 'USB-Interface mit FPGA, Pegelwandler, 4 Lagen',
    en: 'USB interface with FPGA and level shifters, 4 layers',
    license: '0BSD',
    project: 'https://github.com/GlasgowEmbedded/glasgow',
    url: 'https://raw.githubusercontent.com/GlasgowEmbedded/glasgow/HEAD/hardware/boards/glasgow/revC3/glasgow.kicad_pcb',
  },
  {
    id: 'hackrf',
    name: 'HackRF One',
    format: 'KiCad',
    de: 'SDR 1 MHz bis 6 GHz, 4 Lagen, USB, Takte, HF-Teil',
    en: 'SDR 1 MHz to 6 GHz, 4 layers, USB, clocks, RF section',
    license: 'GPL-2.0',
    project: 'https://github.com/greatscottgadgets/hackrf',
    url: 'https://raw.githubusercontent.com/greatscottgadgets/hackrf/HEAD/hardware/hackrf-one/hackrf-one.kicad_pcb',
  },
  {
    id: 'cynthion',
    name: 'Cynthion',
    format: 'KiCad',
    de: 'USB-Analysator, 6 Lagen, mehrere USB-PHYs',
    en: 'USB analyzer, 6 layers, several USB PHYs',
    license: 'CERN-OHL-P-2.0',
    project: 'https://github.com/greatscottgadgets/cynthion-hardware',
    url: 'https://raw.githubusercontent.com/greatscottgadgets/cynthion-hardware/HEAD/cynthion.kicad_pcb',
  },
  {
    id: 'esp32-poe',
    name: 'Olimex ESP32-POE Rev M2',
    format: 'KiCad',
    de: 'ESP32 mit Ethernet (RMII, 50-MHz-Takt) und PoE-Wandler, geteilte Flächen',
    en: 'ESP32 with Ethernet (RMII, 50 MHz clock) and PoE converter, split planes',
    license: 'Apache-2.0',
    project: 'https://github.com/OLIMEX/ESP32-POE',
    url: 'https://raw.githubusercontent.com/OLIMEX/ESP32-POE/HEAD/HARDWARE/ESP32-PoE-hardware-revision-M2/ESP32-PoE_Rev_M2.kicad_pcb',
  },
  {
    id: 'ottercast',
    name: 'OtterCastAudio V2',
    format: 'KiCad',
    de: 'Audio-Streamer mit SoC, Ethernet und USB',
    en: 'Audio streamer with SoC, Ethernet and USB',
    license: 'MIT',
    project: 'https://github.com/Ottercast/OtterCastAudioV2',
    url: 'https://raw.githubusercontent.com/Ottercast/OtterCastAudioV2/HEAD/OtterCastAudioV2.kicad_pcb',
  },
  {
    id: 'nrfmicro',
    name: 'nRFMicro',
    format: 'KiCad',
    de: 'nRF52840-Modul für Tastaturen im Pro-Micro-Format, 2 Lagen ohne Massefläche, eigene 3D-Modelle',
    en: 'nRF52840 module for keyboards in Pro Micro format, 2 layers without a ground plane, own 3D models',
    license: 'Unlicense',
    project: 'https://github.com/joric/nrfmicro',
    url: 'https://raw.githubusercontent.com/joric/nrfmicro/master/hardware/nrfmicro.kicad_pcb',
  },
  {
    id: 'moisture',
    name: 'I²C soil moisture sensor',
    format: 'KiCad',
    de: 'Kapazitiver Bodenfeuchtesensor mit I²C, 4 Lagen, eigene 3D-Modelle',
    en: 'Capacitive soil moisture sensor with I²C, 4 layers, own 3D models',
    license: 'Apache-2.0',
    project: 'https://github.com/Miceuz/i2c-moisture-sensor',
    url: 'https://raw.githubusercontent.com/Miceuz/i2c-moisture-sensor/master/i2c-moist-sensor.kicad_pcb',
  },
  {
    id: 'arduino-uno',
    name: 'Arduino Uno Rev3',
    format: 'Eagle',
    de: 'Der Klassiker: ATmega328P und ATmega16U2 (USB), 2 Lagen mit Masseflächen',
    en: 'The classic: ATmega328P and ATmega16U2 (USB), 2 layers with ground pours',
    license: 'CC-BY-SA-2.5',
    project: 'https://docs.arduino.cc/hardware/uno-rev3/',
    url: 'https://raw.githubusercontent.com/bobc/Arduino_KiCad/master/arduino_Uno_Rev3-02-TH/arduino_Uno_Rev3-02-TH.brd',
  },
  {
    id: 'esp32-thing',
    name: 'SparkFun ESP32 Thing',
    format: 'Eagle',
    de: 'ESP32 mit LiPo-Lader und USB-Seriell, 2 Lagen',
    en: 'ESP32 with LiPo charger and USB serial, 2 layers',
    license: 'CC-BY-SA-4.0',
    project: 'https://github.com/sparkfun/ESP32_Thing',
    url: 'https://raw.githubusercontent.com/sparkfun/ESP32_Thing/master/Hardware/esp32-thing.brd',
  },
  {
    id: 'esp32s3-feather',
    name: 'Adafruit ESP32-S3 TFT Feather',
    format: 'Eagle',
    de: 'ESP32-S3 mit TFT-Anzeige und USB-C, 2 Lagen',
    en: 'ESP32-S3 with TFT display and USB-C, 2 layers',
    license: 'CC-BY-SA-3.0',
    project: 'https://github.com/adafruit/Adafruit-ESP32-S3-TFT-Feather-PCB',
    url: 'https://raw.githubusercontent.com/adafruit/Adafruit-ESP32-S3-TFT-Feather-PCB/main/Adafruit%20ESP32-S3%20TFT%20Feather.brd',
  },
  {
    id: 'particle-core',
    name: 'Particle (Spark) Core',
    format: 'Eagle',
    de: 'STM32 mit WLAN-Modul, 4 Lagen mit Versorgungslagen ($GND, $+3V3)',
    en: 'STM32 with a Wi-Fi module, 4 layers with supply layers ($GND, $+3V3)',
    license: 'CC-BY-SA-4.0',
    project: 'https://github.com/particle-iot/core',
    url: 'https://raw.githubusercontent.com/particle-iot/core/master/EAGLE/core.brd',
  },
  {
    id: 'beaglebone-black',
    name: 'BeagleBone Black',
    format: 'IPC-2581',
    de: 'Einplatinenrechner mit AM335x und DDR3, 6 Lagen, Export aus Cadence Allegro (43 MB)',
    en: 'Single-board computer with AM335x and DDR3, 6 layers, exported from Cadence Allegro (43 MB)',
    license: 'CC-BY-SA-3.0',
    project: 'https://github.com/sjgallagher2/ipc2581',
    url: 'https://raw.githubusercontent.com/sjgallagher2/ipc2581/main/examples/BeagleBone_Black_RevB6_nologo174-AllegroOut/BeagleBone_Black_RevB6_nologo174.xml',
  },
  {
    id: 'ipc2581-testcase10',
    name: 'IPC-2581 test case 10',
    format: 'IPC-2581',
    de: 'Prüfplatine des IPC-2581-Konsortiums: 18 Lagen, BGA mit 576 Kugeln, negative Flächen (21 MB)',
    en: 'Test board of the IPC-2581 consortium: 18 layers, 576-ball BGA, negative planes (21 MB)',
    license: 'test data',
    project: 'https://github.com/sjgallagher2/ipc2581',
    url: 'https://raw.githubusercontent.com/sjgallagher2/ipc2581/main/examples/testcase10-Rev%20C%20data/testcase10-RevC-Full.xml',
  },
  {
    id: 'ocp-expander',
    name: 'Barreleye G2 Expander',
    format: 'ODB++',
    de: 'PCIe-Erweiterung eines POWER9-Servers (Open Compute), 10 Lagen, geteilte Versorgungsflächen',
    en: 'PCIe expander of a POWER9 server (Open Compute), 10 layers, split power planes',
    license: 'OCPHL-P-1.0',
    project: 'https://github.com/opencomputeproject/zaius-barreleye-g2',
    url: 'https://media.githubusercontent.com/media/opencomputeproject/zaius-barreleye-g2/master/HW/EE/GBR/EVT/EXP/Barreleye_G2-EVT-LAYOUT-Expander-ODB-X00-20161124-Final.zip',
  },
  {
    id: 'ocp-fpdb',
    name: 'Barreleye G2 power distribution',
    format: 'ODB++',
    de: 'Stromverteilung und POST-Karte eines Servers, 12 V und 48 V auf eigenen Flächen, 6 Lagen',
    en: 'Power distribution and POST card of a server, 12 V and 48 V on their own planes, 6 layers',
    license: 'OCPHL-P-1.0',
    project: 'https://github.com/opencomputeproject/zaius-barreleye-g2',
    url: 'https://media.githubusercontent.com/media/opencomputeproject/zaius-barreleye-g2/master/HW/EE/GBR/EVT/FPDB%20_%20POST%20card/Barreleye_G2-EVT-LAYOUT-FPDB_POST-ODB-X00-20161116-Final-GCE.zip',
  },
  {
    id: 'ocp-lom-vga',
    name: 'Zaius LOM/VGA card',
    format: 'ODB++',
    de: 'Netzwerk- und VGA-Karte eines Servers (Open Compute), 4 Lagen, negative Masseflächen',
    en: 'Network and VGA card of a server (Open Compute), 4 layers, negative ground planes',
    license: 'OCPHL-P-1.0',
    project: 'https://github.com/opencomputeproject/zaius-barreleye-g2',
    url: 'https://media.githubusercontent.com/media/opencomputeproject/zaius-barreleye-g2/master/HW/EE/GBR/EVT/LOM_VGA%20Card/Zaius-EVT-LAYOUT-LV_Card-ODB-X00-20160824-Final.zip',
  },
];
