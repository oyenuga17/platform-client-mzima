import {
  AfterContentChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { arrayHelpers } from '@helpers';
import { combineLatest, switchMap } from 'rxjs';
import { Location } from '@angular/common';
import { FormsService, DataSourcesService, SurveysService } from '@mzima-client/sdk';
import { BaseComponent } from '../../../base.component';
import { BreakpointService, SessionService, ConfigService, ConfirmModalService } from '@services';
import _ from 'lodash';

@Component({
  selector: 'app-data-source-item',
  templateUrl: './data-source-item.component.html',
  styleUrls: ['./data-source-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
// WHOLE COMPONENT SHOULD BE REFACTORED BECAUSE OF NEW CONFIG API
export class DataSourceItemComponent extends BaseComponent implements AfterContentChecked, OnInit {
  public provider: any;
  public surveyList: any[];
  public form: FormGroup;
  private dataSourceList: any[];
  public selectedSurvey: any;
  public surveyAttributesList: any;
  public currentProviderId: string | null;
  private availableProviders: any[];
  public onCreating: boolean;
  public submitted = false;
  providersData: any;
  cloneProviders: any[];
  tableData: any;

  constructor(
    protected override sessionService: SessionService,
    protected override breakpointService: BreakpointService,
    private fb: FormBuilder,
    private ref: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private configService: ConfigService,
    private dataSourcesService: DataSourcesService,
    private confirmModalService: ConfirmModalService,
    private surveysService: SurveysService,
    private formsService: FormsService,
    private translate: TranslateService,
    private location: Location,
  ) {
    super(sessionService, breakpointService);
    this.checkDesktop();

    this.form = this.fb.group({});
  }

  ngOnInit(): void {
    this.currentProviderId = this.route.snapshot.paramMap.get('id');
    if (!this.currentProviderId) {
      this.onCreating = true;
    }
    this.getProviders();
  }

  loadData(): void {}

  private getAvailableProviders(providers: any) {
    // TODO: REWORK
    const tempProviders: any[] = [];
    for (const key in providers) {
      tempProviders.push({
        id: providers[key]['provider-name'],
        name: providers[key]['provider-name'],
        type: providers[key]['enabled'],
      });
    }
    return arrayHelpers.sortArray(tempProviders.filter((provider) => !provider.type));
  }

  objectToArray(obj: any) {
    return Object.keys(obj).map((key) => ({ label: key, value: obj[key] }));
  }

  private getProviders(): void {
    // this.dataSourcesService
    //   .getDataSource()
    //   .pipe(switchMap((dataSources) => this.configService.getProvidersData(dataSources)))
    //   .subscribe({
    //     next: (providers) => {
    //       this.providersData = arrayHelpers.sortArray(providers, 'name');
    //       this.cloneProviders = _.cloneDeep(this.providersData);
    //       // this.availableProviders = this.getAvailableProviders(this.providersData);
    //       console.log('providers: ', this.providersData);
    //     },
    //   });

    const providers$ = this.dataSourcesService
      .getDataSource()
      .pipe(switchMap((dataSources) => this.configService.getProvidersData(dataSources)));
    const surveys$ = this.surveysService.get();
    // const dataSources$ = this.configService.getAllProvidersData();

    combineLatest([providers$, surveys$]).subscribe({
      next: ([providers, surveys]) => {
        // const dataSourcesResult = dataSources.filter(
        //   (dataSource: DataSourceResult) => dataSource.id !== 'gmail',
        // );
        // this.providersData = this.removeProvider(providersData, 'gmail');
        this.surveyList = surveys.results;
        this.providersData = arrayHelpers.sortArray(providers, 'name');
        this.providersData.map((p: any) => {
          p.visible_survey = !!p.params.form_id;
          p.selected_survey = this.surveyList.find((s) => s.id === p.params.form_id);
        });
        this.cloneProviders = _.cloneDeep(this.providersData);
        // this.availableProviders = this.getAvailableProviders(this.providersData);

        // this.dataSourceList = this.dataSourcesService.combineDataSource(
        //   this.providersData,
        //   dataSourcesResult,
        //   this.surveyList,
        // );
        this.setCurrentProvider();
      },
    });
  }

  public setCurrentProvider(providerId?: any): void {
    if (!this.currentProviderId && !providerId) {
      this.currentProviderId = this.providersData.filter((p: any) => !p.enabled)[0]?.id;
    }
    const id = this.currentProviderId || providerId;
    if (id) {
      this.provider = this.providersData.find((provider: any) => provider.id === id);
      this.removeControls(this.form.controls);
      this.createForm(this.provider);
      this.addControlsToForm('id', this.fb.control(this.provider.id, Validators.required));
      this.getSurveyAttributes(this.provider.selected_survey);
    } else {
      this.router.navigate(['/settings/data-sources']);
    }
  }

  public getSurveyAttributes(survey: any): void {
    if (!survey) return;
    this.form.patchValue({ form_id: survey });
    this.selectedSurvey = survey;
    const queryParams = {
      order: 'asc',
      orderby: 'priority',
    };
    this.formsService.getAttributes(survey.id, queryParams).subscribe({
      next: (response) => {
        this.surveyAttributesList = response;
        this.tableData = this.objectToArray(this.provider.inbound_fields);
        for (const el of this.tableData) {
          this.addControlsToForm(el.label, this.fb.control(''));
          this.form.patchValue({
            [el.label]: this.checkKeyFields(this.provider.params[el.label]),
          });
        }
      },
    });
  }

  ngAfterContentChecked() {
    this.ref.detectChanges();
  }

  private createForm(provider: any) {
    this.addControlsToForm('form_id', this.fb.control(this.provider?.selected_survey));
    this.createControls(provider.options);
  }

  private removeControls(controls: any) {
    for (const [key] of Object.entries(controls)) {
      this.form.removeControl(key);
    }
  }

  private createControls(controls: any[]) {
    for (const control of controls) {
      const validatorsToAdd = [];

      if (control?.rules) {
        for (const rule of control.rules) {
          switch (rule) {
            case 'required':
              validatorsToAdd.push(Validators.required);
              break;
            default:
              break;
          }
        }
      }
      this.addControlsToForm(control.id, this.fb.control(control.value, validatorsToAdd));
    }
  }

  private addControlsToForm(name: string, control: AbstractControl) {
    this.form.addControl(name, control);
  }

  public async turnOffDataSource(event: any): Promise<void> {
    if (!event.checked) {
      this.cloneProviders.find((p) => p.id === this.provider.id).enabled = event.checked;
      const confirmed = await this.confirmModalService.open({
        title: this.translate.instant(`settings.data_sources.provider_name`, {
          providerName: this.provider.name,
        }),
        description: this.translate.instant(
          'settings.data_sources.do_you_really_want_to_disconnect',
        ),
        confirmButtonText: this.translate.instant('app.yes_delete'),
        cancelButtonText: this.translate.instant('app.no_go_back'),
      });
      // if (!confirmed) {
      //   this.provider.enabled = true;
      //   return;
      // }
      if (confirmed) {
        this.configService
          .updateProviderById(this.form.value.id, this.prepareAPI(false)[this.form.value.id])
          .subscribe({
            next: () => this.router.navigate(['/settings/data-sources']),
            error: () => (this.submitted = false),
          });
      }
    }

    this.cloneProviders.find((p) => p.id === this.provider.id).enabled = event.checked;
  }

  public saveProviderData(): void {
    this.submitted = true;
    // if (this.form.value.form_id) {
    //   for (const field of this.test) {
    //     this.form.patchValue({
    //       [field.label]: this.fillForApi(
    //         this.filterAttributes('key', this.form.controls[field.label].value),
    //       ),
    //     });
    //   }
    // }
    const preparedForAPI = this.prepareAPI()[this.form.value.id];
    this.configService.updateProviderById(this.form.value.id, preparedForAPI).subscribe({
      next: () => this.router.navigate(['/settings/data-sources']),
      error: () => (this.submitted = false),
    });
  }

  private prepareAPI(enabled = true) {
    // REWORK THIS
    const prov = this.cloneProviders.find((p) => p.id === this.form.value.id);
    if (!prov) {
      for (const providerKey in prov.params) {
        prov.params[providerKey] = this.form.value[providerKey];
      }
      if (this.provider.visible_survey) {
        prov.form_id = this.form.value.form_id.id;
        if (prov.form_id) {
          const obj: any = {};
          for (const field of this.tableData) {
            obj[field.label] = this.form.value[field.label];
          }
          prov.inbound_fields = obj;
        }
      } else {
        delete prov.form_id;
        delete prov.inbound_fields;
      }
      return { ...prov };
    } else {
      const provider: any = {};
      provider[this.form.value.id] = {};
      provider[this.form.value.id].params = this.form.value;
      provider[this.form.value.id].enabled = enabled;
      if (this.provider.visible_survey) {
        provider[this.form.value.id]['provider-name'] = this.form.value.id;
        provider[this.form.value.id].params.form_id = this.form.value.form_id.id;
        // provider[this.form.value.id].form_id = this.form.value.form_id.id;
        if (provider[this.form.value.id].params.form_id) {
          const obj: any = {};
          for (const field of this.tableData) {
            obj[field.label] = this.form.value[field.label];
          }
          provider[this.form.value.id].params.inbound_fields = obj;
        }
      } else {
        delete provider[this.form.value.id].params.form_id;
        delete provider[this.form.value.id].params.inbound_fields;
      }
      return { ...provider };
    }
  }

  private checkKeyFields(field: string): any {
    if (field === 'title' || field === 'content') {
      return this.filterAttributes('type', field === 'title' ? field : 'description')?.key;
    } else if (field) {
      return field.replace(/values./gi, '');
    }
  }

  private filterAttributes(param: string, value: string) {
    return this.surveyAttributesList.find((el: any) => el[param] === value);
  }

  private fillForApi(obj: any): string {
    if (!obj) return '';
    if (obj.type === 'title' || obj.type === 'description') {
      return obj.type === 'title' ? obj.type : 'content';
    } else {
      return `values.${obj.key}`;
    }
  }

  public back() {
    if (this.isDesktop) {
      this.router.navigate(['settings/data-sources']);
    } else {
      this.location.back();
    }
  }

  public isProviderEnabled(provider: any): boolean {
    return provider.enabled;
  }
}
