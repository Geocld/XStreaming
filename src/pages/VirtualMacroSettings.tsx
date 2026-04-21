import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {
  Text,
  Card,
  Button,
  Divider,
  List,
  Portal,
  Modal,
  IconButton,
  Checkbox,
  Switch,
} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../store/settingStore';
import {
  DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
  normalizeMacroStep,
  normalizeMacroSteps,
  VIRTUAL_MACRO_ALLOWED_BUTTONS,
  VirtualMacroStep,
} from '../utils/virtualMacro';

type EditingState = {
  index: number;
  step: VirtualMacroStep;
};

function VirtualMacroSettingsScreen({navigation}) {
  const {t} = useTranslation();
  const [settings, setSettings] = React.useState<any>({});
  const [steps, setSteps] = React.useState<VirtualMacroStep[]>(
    DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
  );
  const [editing, setEditing] = React.useState<EditingState | null>(null);

  React.useEffect(() => {
    const userSettings = getSettings();
    setSettings(userSettings);
    const shortSteps = normalizeMacroSteps(
      userSettings.virtual_macro_short_press_steps,
      DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
    );
    const longSteps = normalizeMacroSteps(
      userSettings.virtual_macro_long_press_steps,
      DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
    );
    setSteps(shortSteps.length ? shortSteps : longSteps);
  }, []);

  const handleMacroEnabledChange = (enabled: boolean) => {
    const nextSettings = {
      ...settings,
      virtual_macro_enabled: enabled,
    };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const openAddModal = () => {
    setEditing({
      index: -1,
      step: {
        buttons: ['A'],
        durationMs: 80,
        waitAfterMs: 0,
      },
    });
  };

  const openEditModal = (index: number) => {
    const step = steps[index];
    if (!step) {
      return;
    }
    setEditing({
      index,
      step: {...step},
    });
  };

  const saveEditingStep = () => {
    if (!editing) {
      return;
    }
    const fallbackButton = steps[0]?.buttons?.[0] || 'A';
    const normalized = normalizeMacroStep(editing.step, fallbackButton);
    const next = [...steps];
    if (editing.index >= 0) {
      next[editing.index] = normalized;
    } else {
      next.push(normalized);
    }
    setSteps(next);
    setEditing(null);
  };

  const deleteEditingStep = () => {
    if (!editing || editing.index < 0) {
      return;
    }
    const next = steps.filter((_, idx) => idx !== editing.index);
    setSteps(next);
    setEditing(null);
  };

  const handleSave = () => {
    const normalized = normalizeMacroSteps(
      steps,
      DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
    );
    const nextSettings = {
      ...settings,
      virtual_macro_short_press_steps: normalized,
      virtual_macro_long_press_steps: normalized,
    };
    setSettings(nextSettings);
    saveSettings(nextSettings);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Card style={styles.heroCard}>
          <Card.Content>
            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.switchTitle}>
                  {t('Virtual macro button')}
                </Text>
                <Text style={styles.switchDesc}>
                  {t('Enable virtual macro button')}
                </Text>
              </View>
              <Switch
                value={!!settings.virtual_macro_enabled}
                onValueChange={handleMacroEnabledChange}
                color="#107C10"
              />
            </View>
            <Divider style={styles.switchDivider} />
            <Text style={styles.heroDesc}>
              {t(
                'Configure one continuous macro chain. Steps execute from top to bottom when pressing macro button.',
              )}
            </Text>
            <Text style={styles.heroHint}>
              {t(
                'Enable macro button and edit its action sequence in one place.',
              )}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.sectionCard}>
          <Card.Title
            title={t('Macro action sequence')}
            subtitle={t('Tap + to add sequence step')}
            right={() => (
              <IconButton icon="plus-circle-outline" onPress={openAddModal} />
            )}
          />
          <Card.Content>
            {steps.length === 0 ? (
              <Text style={styles.emptyText}>
                {t('No action steps, tap + to add')}
              </Text>
            ) : (
              steps.map((step, index) => (
                <List.Item
                  key={`step-${index}`}
                  title={`${index + 1}. ${step.buttons.join(' + ')}`}
                  description={`${t('Hold')}: ${step.durationMs}ms · ${t(
                    'Wait',
                  )}: ${step.waitAfterMs}ms`}
                  left={props => (
                    <List.Icon {...props} icon="gesture-tap-button" />
                  )}
                  right={props => (
                    <IconButton
                      {...props}
                      icon="pencil-outline"
                      onPress={() => openEditModal(index)}
                    />
                  )}
                  onPress={() => openEditModal(index)}
                />
              ))
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handleSave}
          style={styles.footerButton}>
          {t('Save')}
        </Button>
        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          style={styles.footerButton}>
          {t('Back')}
        </Button>
      </View>

      <Portal>
        <Modal
          visible={!!editing}
          onDismiss={() => setEditing(null)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Title
              title={editing?.index !== -1 ? t('Edit action') : t('Add action')}
            />
            <Card.Content>
              <Text style={styles.modalLabel}>{t('Buttons')}</Text>
              <Divider />
              <ScrollView style={styles.buttonsScroll}>
                {VIRTUAL_MACRO_ALLOWED_BUTTONS.map(button => {
                  const selected = editing?.step.buttons?.includes(button);
                  return (
                    <Checkbox.Item
                      key={button}
                      label={button}
                      status={selected ? 'checked' : 'unchecked'}
                      onPress={() => {
                        if (!editing) {
                          return;
                        }
                        const current = Array.isArray(editing.step.buttons)
                          ? editing.step.buttons
                          : [];
                        const next = selected
                          ? current.filter(item => item !== button)
                          : [...current, button];
                        setEditing({
                          ...editing,
                          step: {
                            ...editing.step,
                            buttons: next,
                          },
                        });
                      }}
                    />
                  );
                })}
                {!!editing?.step.buttons?.length && (
                  <Button
                    compact
                    mode="text"
                    onPress={() => {
                      if (!editing) {
                        return;
                      }
                      setEditing({
                        ...editing,
                        step: {
                          ...editing.step,
                          buttons: [],
                        },
                      });
                    }}>
                    {t('Reset')}
                  </Button>
                )}
              </ScrollView>

              <Text style={styles.modalLabel}>
                {t('Hold duration')}: {editing?.step.durationMs ?? 0}ms
              </Text>
              <Slider
                value={editing?.step.durationMs ?? 80}
                minimumValue={30}
                maximumValue={5000}
                step={10}
                onValueChange={val => {
                  if (!editing) {
                    return;
                  }
                  setEditing({
                    ...editing,
                    step: {
                      ...editing.step,
                      durationMs: Math.round(val),
                    },
                  });
                }}
                minimumTrackTintColor="#107C10"
                maximumTrackTintColor="#5f5f5f"
              />

              <Text style={styles.modalLabel}>
                {t('Wait after action')}: {editing?.step.waitAfterMs ?? 0}ms
              </Text>
              <Slider
                value={editing?.step.waitAfterMs ?? 0}
                minimumValue={0}
                maximumValue={3000}
                step={10}
                onValueChange={val => {
                  if (!editing) {
                    return;
                  }
                  setEditing({
                    ...editing,
                    step: {
                      ...editing.step,
                      waitAfterMs: Math.round(val),
                    },
                  });
                }}
                minimumTrackTintColor="#107C10"
                maximumTrackTintColor="#5f5f5f"
              />

              <View style={styles.modalActions}>
                {editing?.index !== -1 && (
                  <Button
                    mode="text"
                    textColor="#D32F2F"
                    onPress={deleteEditingStep}>
                    {t('Delete')}
                  </Button>
                )}
                <Button mode="outlined" onPress={() => setEditing(null)}>
                  {t('Cancel')}
                </Button>
                <Button mode="contained" onPress={saveEditingStep}>
                  {t('Confirm')}
                </Button>
              </View>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    marginBottom: 120,
  },
  heroCard: {
    margin: 12,
    backgroundColor: '#16351c',
  },
  heroTitle: {
    color: '#D7FFD4',
    fontSize: 18,
    fontWeight: '700',
  },
  heroDesc: {
    color: '#C0D8BF',
    marginTop: 6,
    lineHeight: 20,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  switchTitle: {
    color: '#D7FFD4',
    fontSize: 16,
    fontWeight: '700',
  },
  switchDesc: {
    color: '#a5c6a3',
    marginTop: 4,
  },
  switchDivider: {
    marginTop: 12,
  },
  heroHint: {
    color: '#a5c6a3',
    marginTop: 8,
    lineHeight: 18,
  },
  sectionCard: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  emptyText: {
    opacity: 0.7,
    paddingVertical: 10,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 20,
    paddingHorizontal: 12,
  },
  footerButton: {
    marginTop: 10,
  },
  modal: {
    marginHorizontal: '8%',
  },
  modalLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  modalActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonsScroll: {
    maxHeight: 220,
  },
});

export default VirtualMacroSettingsScreen;
