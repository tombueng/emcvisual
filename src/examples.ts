/**
 * Public KiCad boards to try the app on. They are not in the repository (they belong to their
 * projects and keep their licenses); the app loads them straight from GitHub, which allows
 * cross-origin reads of raw files.
 */
export interface ExampleBoard {
  id: string;
  name: string;
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
    de: 'USB-Interface mit FPGA, Pegelwandler, 4 Lagen',
    en: 'USB interface with FPGA and level shifters, 4 layers',
    license: '0BSD',
    project: 'https://github.com/GlasgowEmbedded/glasgow',
    url: 'https://raw.githubusercontent.com/GlasgowEmbedded/glasgow/HEAD/hardware/boards/glasgow/revC3/glasgow.kicad_pcb',
  },
  {
    id: 'hackrf',
    name: 'HackRF One',
    de: 'SDR 1 MHz bis 6 GHz, 4 Lagen, USB, Takte, HF-Teil',
    en: 'SDR 1 MHz to 6 GHz, 4 layers, USB, clocks, RF section',
    license: 'GPL-2.0',
    project: 'https://github.com/greatscottgadgets/hackrf',
    url: 'https://raw.githubusercontent.com/greatscottgadgets/hackrf/HEAD/hardware/hackrf-one/hackrf-one.kicad_pcb',
  },
  {
    id: 'cynthion',
    name: 'Cynthion',
    de: 'USB-Analysator, 6 Lagen, mehrere USB-PHYs',
    en: 'USB analyzer, 6 layers, several USB PHYs',
    license: 'CERN-OHL-P-2.0',
    project: 'https://github.com/greatscottgadgets/cynthion-hardware',
    url: 'https://raw.githubusercontent.com/greatscottgadgets/cynthion-hardware/HEAD/cynthion.kicad_pcb',
  },
  {
    id: 'esp32-poe',
    name: 'Olimex ESP32-POE Rev M2',
    de: 'ESP32 mit Ethernet (RMII, 50-MHz-Takt) und PoE-Wandler, geteilte Flächen',
    en: 'ESP32 with Ethernet (RMII, 50 MHz clock) and PoE converter, split planes',
    license: 'Apache-2.0',
    project: 'https://github.com/OLIMEX/ESP32-POE',
    url: 'https://raw.githubusercontent.com/OLIMEX/ESP32-POE/HEAD/HARDWARE/ESP32-PoE-hardware-revision-M2/ESP32-PoE_Rev_M2.kicad_pcb',
  },
  {
    id: 'ottercast',
    name: 'OtterCastAudio V2',
    de: 'Audio-Streamer mit SoC, Ethernet und USB',
    en: 'Audio streamer with SoC, Ethernet and USB',
    license: 'MIT',
    project: 'https://github.com/Ottercast/OtterCastAudioV2',
    url: 'https://raw.githubusercontent.com/Ottercast/OtterCastAudioV2/HEAD/OtterCastAudioV2.kicad_pcb',
  },
];
