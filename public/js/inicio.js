import { $, lembrar } from './lib/ui.js';

const ult = lembrar('ultimaSelecao');
const card = $('#continuar');
if (card && ult?.avaliacao && ult?.turma) {
  card.hidden = false;
  $('#continuarTexto').textContent = ult.rotulo || 'Retome de onde parou.';
  $('#continuarLink').href =
    `/lancamentos?avaliacao=${ult.avaliacao}&turma=${ult.turma}&disciplina=${ult.disciplina || ''}`;
}
