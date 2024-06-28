import Token from './base';

// export interface IMsalToken {
//   lpt: string
//   refresh_token: string
//   user_id: string
// }

export default class MsalToken extends Token {
  data;

  constructor(data) {
    super(data);
    this.data = data;
  }
}
