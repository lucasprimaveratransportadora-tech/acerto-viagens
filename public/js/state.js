// state.js — Client-side state cache

export let state = {
  trucks: [],
  trips: [],
  selectedTruckId: null,
};

export function setTrucks(trucks) { state.trucks = trucks; }
export function setTrips(trips) { state.trips = trips; }
export function setSelectedTruck(id) { state.selectedTruckId = id; }
export function getSelectedTruck() { return state.trucks.find(t => t.id === state.selectedTruckId); }

export const DESP = [
  { k: 'DESC_CTE_1', l: 'Descarga CTE 1' },
  { k: 'DESC_CTE_2', l: 'Descarga CTE 2' },
  { k: 'DESC_CTE_3', l: 'Descarga CTE 3' },
  { k: 'DESC_CTE_4', l: 'Descarga CTE 4' },
  { k: 'DESC_CTE_5', l: 'Descarga CTE 5' },
  { k: 'DESC_CTE_6', l: 'Descarga CTE 6' },
  { k: 'ABASTECIMENTO', l: 'Abastecimento' },
  { k: 'COMISSAO_MOTORISTA', l: 'Comissão Motorista' },
  { k: 'BORRACHARIA', l: 'Borracharia' },
  { k: 'LIMPEZA', l: 'Limpeza carreta JT' },
  { k: 'ESTACIONAMENTO', l: 'Estacionamento' },
  { k: 'CARREGAMENTO', l: 'Carregamento preforma' },
  { k: 'AGENCIAMENTO', l: 'Agenciamento' },
  { k: 'EXTRAS', l: 'Extras' },
  { k: 'PEDAGIO', l: 'Pedágio' },
  { k: 'ARLA', l: 'Arla' },
  { k: 'AVARIA', l: 'Avaria' },
];
