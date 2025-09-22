import i18next from '../../i18n';

const {t} = i18next;

const vgamepad = [
  {
    name: 'show_virtual_gamead',
    type: 'radio',
    title: t('Virtual gamepad'),
    description: t('Always display the virtual gamepad'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'virtual_gamepad_opacity',
    type: 'slider',
    min: 0,
    max: 1,
    step: 0.1,
    title: t('Virtual Opacity'),
    description: t('Config opacity of virtual gamepad'),
    data: [],
  },
  {
    name: 'virtual_gamepad_joystick',
    type: 'radio',
    title: t('virtual_joystick_title'),
    description: t('virtual_joystick_desc'),
    tips: t('virtual_joystick_tips'),
    data: [
      {value: 1, text: t('Free')},
      {value: 0, text: t('Fixed')},
    ],
  },
];

export default vgamepad;
