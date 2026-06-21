import {Component, computed, signal, viewChild, inject} from '@angular/core';
import {CurrencyPipe} from '@angular/common';
import {InputCurrency} from '../../ui/input-currency/input-currency';
import {DiscreteSlider} from '../../ui/discrete-slider/discrete-slider';
import {MonthlyPayments} from './components/monthly-payments/monthly-payments';
import {SimulatorService} from './simulator.service';
import {toObservable} from '@angular/core/rxjs-interop';
import {filter, switchMap, tap, catchError, from, of, map, timer} from 'rxjs';
import {CentsToCurrencyPipe} from '../../core/pipes/cents-to-currency-pipe';

@Component({
  selector: 'pkb-simulator',
  imports: [
    InputCurrency,
    DiscreteSlider,
    MonthlyPayments,
    CurrencyPipe,
    CentsToCurrencyPipe,
  ],
  templateUrl: './simulator.html',
  styleUrl: './simulator.css',
})
export class Simulator {
  private simulatorService = inject(SimulatorService);

  inputCurrencyRef = viewChild(InputCurrency);
  centsAmount = computed(() => this.inputCurrencyRef()?.centsValue() ?? 0n);

  months = signal<number>(3);

  monthlyPaymentsInCents = signal<bigint[]>([]);
  cashbackCents = signal<bigint>(0n);
  cashbackPercents = signal<number>(0);
  allowConfirming = computed(() => {
    return !!(
      !this.isErrorWhenCalculation() &&
      this.monthlyPaymentsInCents().length &&
      this.cashbackCents() &&
      this.cashbackPercents()
    )
  })
  isErrorWhenCalculation = signal<boolean>(false);

  private calcData = computed(() => ({
    amount: this.centsAmount(),
    months: this.months()
  }));

  constructor() {
    this.setupSimulationPipeline();
  }

  confirm() {
    // new Promise( async () => {
    //   try {
    //     // Call it just like a normal async function
    //     const res = await this.simulatorService.calculate({
    //       amountCents: BigInt(this.centsAmount()),
    //       months: this.months(),
    //     });
    //     (BigInt.prototype as any).toJSON = function () {
    //       return this.toString();
    //     };
    //     alert(`res: ${JSON.stringify(res)}`)
    //   } catch (err) {
    //     alert(`failed to connect over grpc, ${err}`);
    //   }
    // })
    alert("This is just a simulation, confirm part is unimplemented")
  }

  private setupSimulationPipeline() {
    toObservable(this.calcData).pipe(
      tap(() => {
        this.isErrorWhenCalculation.set(false);
      }),
      filter(params => this.isValid(params.amount, params.months)),
      switchMap(params => {
        // remove flickering when data arrives too fast
        const loadingIndicator$ = timer(20).pipe(
          tap(() => {
            this.monthlyPaymentsInCents.set([]);
            this.cashbackCents.set(0n);
            this.cashbackPercents.set(0);
          }),
          map(() => null) // Ignore result
        );
        const request$ = from(this.simulatorService.calculate({
          amountCents: BigInt(params.amount),
          months: params.months
        })).pipe(
          catchError(err => {
            console.error('Simulation failed', err);
            this.isErrorWhenCalculation.set(true);
            return of(null);
          })
        );

        return loadingIndicator$.pipe(
          switchMap(() => request$),
        );
      })
    ).subscribe(response => {
      if (response) {
        this.monthlyPaymentsInCents.set(response.installments)
        this.cashbackCents.set(response.cashbackCents)
        this.cashbackPercents.set(response.cashbackPercents)
      } else {
        this.isErrorWhenCalculation.set(true);
      }
    });
  }

  private isValid(amount: bigint, months: number): boolean {
    return amount > 0 && months >= 3;
  }
}
