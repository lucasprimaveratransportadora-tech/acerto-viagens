class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }

  static badRequest(msg = 'Requisição inválida.') {
    return new ApiError(400, msg);
  }

  static unauthorized(msg = 'Não autorizado.') {
    return new ApiError(401, msg);
  }

  static forbidden(msg = 'Acesso negado.') {
    return new ApiError(403, msg);
  }

  static notFound(msg = 'Não encontrado.') {
    return new ApiError(404, msg);
  }

  static conflict(msg = 'Conflito.') {
    return new ApiError(409, msg);
  }
}

module.exports = ApiError;
