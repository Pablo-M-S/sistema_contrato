// Campos obrigatórios do comprador - fonte única usada tanto pelo backend
// (src/routes/publico.js, via require) quanto pelo formulário público do
// cliente (src/publico/js/preencher.js, via <script src="...">).

(function (root, factory) {
    const modulo = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = modulo;
    } else {
        root.ValidacaoComprador = modulo;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {

    const CAMPOS_OBRIGATORIOS = ['nome', 'rg', 'cpf', 'telefone', 'endereco', 'estado_civil'];

    function validar(dados) {
        return CAMPOS_OBRIGATORIOS.filter((campo) => !dados[campo]);
    }

    return { CAMPOS_OBRIGATORIOS, validar };
});
