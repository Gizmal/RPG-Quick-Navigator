**free
ctl-opt actgrp(*new) dftactgrp(*no) bnddir('QC2LE');

dcl-s z1_var     varchar(250);
dcl-s z2_char    char(200);
dcl-s z3_int     int(5);
dcl-s z4_dec     packed(10:2);
dcl-s z5_boolean ind;

dcl-ds z6_ds qualified inz;
  unsigned uns(10);
  zoned    zoned(15:3);
end-ds;

dcl-s z7_tab     char(200) dim(*auto:100);
dcl-s z8_date    date;
dcl-s z9_time    time;
dcl-s z10_ts     timestamp;
dcl-s z11_return varchar(10);

dcl-pr c_srand extproc('srand');
  seed uns(10) value;
end-pr;

dcl-pr c_rand int(10) extproc('rand');
end-pr;

for z3_int = 1 to 5;
  z7_tab(z3_int) = %char(z3_int);
endfor;

z4_dec = 1;
z1_var = %char(z4_dec);

dow z4_dec < 1100;
  z1_var += ', ' + %char(z4_dec);
  z4_dec *= 2;
enddo;

z8_date = %date();
z9_time = %time();
z10_ts  = %timestamp(*sys);

exsr subroutine;
z11_return = procedure(z4_dec);

dsply ('sr+proc took: ' + %char(%diff(%timestamp():z10_ts:*ms)) + 'µs');
dsply ('and returned a ' + z11_return + ' number');

*inlr = *on;
return;

begsr subroutine;
  for-each z2_char in z7_tab;
    z6_ds.unsigned += 1;
    z6_ds.zoned    += %charcount(z2_char);
  endfor;
endsr;

dcl-proc procedure;
  dcl-s random int(10);
  dcl-s result varchar(10);

  dcl-pi *n like(z11_return);
    entry like(z4_dec);
  end-pi;
           
