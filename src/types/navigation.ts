export type AnyObject = Record<string, any>;

export type NavigationProp = {
  navigate: (screen: string, params?: AnyObject) => void;
  goBack?: () => void;
  setOptions?: (options: AnyObject) => void;
};

export type RouteProp = {
  params?: AnyObject;
};
