export class ResponseDto<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;

  constructor(data: T, message = 'success', code = 0) {
    this.code = code;
    this.message = message;
    this.data = data;
    this.timestamp = Date.now();
  }

  static ok<T>(data: T, message = 'success') {
    return new ResponseDto(data, message, 0);
  }

  static fail(message: string, code = 500) {
    return new ResponseDto(null, message, code);
  }
}

export class PageDto<T> {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };

  constructor(list: T[], total: number, page: number, pageSize: number) {
    this.list = list;
    this.pagination = {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
