// Domain errors — phân loại lỗi để API map sang status an toàn (security: lỗi không lộ chi tiết nhạy cảm).

export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Không tìm thấy HOẶC không thuộc owner — trả 404 đồng nhất để không lộ tồn tại (sec BOLA/IDOR). */
export class NotFoundError extends DomainError {
  constructor(message = 'Không tìm thấy') {
    super(message, 'NOT_FOUND');
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION');
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

export class AuthError extends DomainError {
  constructor(message = 'Xác thực thất bại') {
    super(message, 'AUTH');
  }
}

export class RateLimitError extends DomainError {
  constructor(message = 'Vượt giới hạn tần suất, thử lại sau') {
    super(message, 'RATE_LIMIT');
  }
}

/** Lỗi tích hợp hệ ngoài (Azure/Claude/Slack) — có thể retry. */
export class IntegrationError extends DomainError {
  constructor(message: string, public readonly retryable = true) {
    super(message, 'INTEGRATION');
  }
}
