export type Empreendimento = {
  id: string;
  nome: string;
  slug: string;
  lat: number;
  lng: number;
};

export const MOCK_EMPREENDIMENTOS: Empreendimento[] = [
  {
    id: "1",
    nome: "Floramazônia - CMO",
    slug: "floramazonia-cmo",
    lat: -16.6869,
    lng: -49.2648,
  },
  {
    id: "2",
    nome: "Max Cidade - Vega",
    slug: "max-cidade-vega",
    lat: -16.6769,
    lng: -49.2548,
  },
];
